import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import mri from 'mri';
import glob from 'tiny-glob/sync.js';
import fuzzysearch from 'fuzzysearch';
import enquirer from 'enquirer';
import degit from './index.js';
import { tryRequire, base } from './utils.js';

const args = mri(process.argv.slice(2), {
	alias: {
		f: 'force',
		c: 'cache',
		v: 'verbose',
		m: 'mode',
	},
	boolean: ['force', 'cache', 'verbose'],
});

const [src, dest = '.'] = args._;

async function main() {
	if (args.help) {
		const help = fs
			.readFileSync(path.join(__dirname, 'help.md'), 'utf-8')
			// 正则表达式中的 ^(\s*)#+ (.+) 模式表示匹配以任意数量的空格开头
			// 紧接着一个或多个 #，然后是一个空格和标题的内容。
			// 使用 g 标志可以确保将所有匹配项都进行替换，而不仅仅是第一个匹配项
			// 而使用 m 标志可以使正则表达式跨越多行进行匹配，而不仅仅是单行
			// 在回调函数中，m 是匹配到的每一个字串，s 表示匹配到的空格部分，_ 表示标题的内容部分
			.replace(/^(\s*)#+ (.+)/gm, (m, s, _) => {
				// 将标题加粗，并去除 #
				// `   # _degit_` -> `   _degit_`
				return s + chalk.bold(_);
			})
			// 将 _degit_ 转成 degit(带下划线)
			.replace(/_([^_]+)_/g, (m, _) => {
				return chalk.underline(_);
			})
			.replace(/`([^`]+)`/g, (m, _) => {
				// 将 `` 包裹的字符，比如 `degit <src>[#ref] [<dest>] [options]` 的字体色变为 cyan
				return chalk.cyan(_);
			});

		process.stdout.write(`\n${help}\n`);
	} else if (!src) {
		// interactive mode

		const accessLookup = new Map();

		glob(`**/access.json`, { cwd: base }).forEach(file => {
			const [host, user, repo] = file.split(path.sep);

			const json = fs.readFileSync(`${base}/${file}`, 'utf-8');
			const logs = JSON.parse(json);

			Object.entries(logs).forEach(([ref, timestamp]) => {
				const id = `${host}:${user}/${repo}#${ref}`;
				accessLookup.set(id, new Date(timestamp).getTime());
			});
		});

		const getChoice = file => {
			const [host, user, repo] = file.split(path.sep);

			return Object.entries(tryRequire(`${base}/${file}`)).map(
				([ref, hash]) => ({
					name: hash,
					message: `${host}:${user}/${repo}#${ref}`,
					value: `${host}:${user}/${repo}#${ref}`,
				}),
			);
		};

		const choices = glob(`**/map.json`, { cwd: base })
			.map(getChoice)
			.reduce(
				(accumulator, currentValue) => accumulator.concat(currentValue),
				[],
			)
			.sort((a, b) => {
				const aTime = accessLookup.get(a.value) || 0;
				const bTime = accessLookup.get(b.value) || 0;

				return bTime - aTime;
			});

		const options = await enquirer.prompt([
			{
				type: 'autocomplete',
				name: 'src',
				message: 'Repo to clone?',
				suggest: (input, choices) =>
					choices.filter(({ value }) => fuzzysearch(input, value)),
				choices,
			},
			{
				type: 'input',
				name: 'dest',
				message: 'Destination directory?',
				initial: '.',
			},
			{
				type: 'toggle',
				name: 'cache',
				message: 'Use cached version?',
			},
		]);

		const empty =
			!fs.existsSync(options.dest) || fs.readdirSync(options.dest).length === 0;

		if (!empty) {
			const { force } = await enquirer.prompt([
				{
					type: 'toggle',
					name: 'force',
					message: 'Overwrite existing files?',
				},
			]);

			if (!force) {
				console.error(chalk.magenta(`! Directory not empty — aborting`));
				return;
			}
		}

		run(options.src, options.dest, {
			force: true,
			cache: options.cache,
		});
	} else {
		run(src, dest, args);
	}
}

function run(src, dest, args) {
	const d = degit(src, args);

	d.on('info', event => {
		console.error(chalk.cyan(`> ${event.message.replace('options.', '--')}`));
	});

	d.on('warn', event => {
		console.error(
			chalk.magenta(`! ${event.message.replace('options.', '--')}`),
		);
	});

	d.clone(dest).catch(err => {
		console.error(chalk.red(`! ${err.message.replace('options.', '--')}`));
		process.exit(1);
	});
}

main();
