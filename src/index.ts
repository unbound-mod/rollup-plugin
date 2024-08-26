import type { NormalizedOutputOptions, OutputBundle, OutputChunk, Plugin } from 'rollup';
import { writeFile, access, rm, readFile, mkdir } from 'fs/promises';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { tmpdir } from 'os';

function hermesc(options?: { hermesc: string; }): Plugin {
	const { hermesc } = options ?? { hermesc: join(__dirname, '..', '..', 'hermesc') };

	return {
		name: 'hermesc',

		async generateBundle(options: NormalizedOutputOptions, bundle: OutputBundle, isWrite: boolean) {
			try {
				await access(hermesc);
			} catch (e) {
				this.warn('The hermesc binary path provided is either not accessible or does not exist. Aborting hermesc compilation.');
				return;
			}

			const out = options.file?.split('/');
			if (!out) return;

			const file = out.pop();
			const name = file.split('.').shift();

			const output = bundle[file] as OutputChunk;
			if (!output) return;

			this.info(`${options.file} -> ${options.file.replace(file, name + '.bundle')}...`);

			const extension = process.platform === 'win32' ? '.exe' : '';
			const bin = resolve(hermesc, process.platform, 'hermesc' + extension);
			const temp = join(tmpdir(), 'hermesc');

			if (!existsSync(bin)) {
				this.warn('The hermesc binary is either not supported for your OS or cannot be found. Aborting hermesc compilation.');
				return;
			}

			if (!existsSync(temp)) {
				await mkdir(temp);
			}

			const bytecode = join(temp, randomBytes(8).readUint32LE(0) + '.bundle');
			const js = join(temp, randomBytes(8).readUint32LE(0) + '.js');

			const args = ['--emit-binary', '--out', bytecode, '-Wno-direct-eval', '-Wno-undefined-variable', js];

			await writeFile(js, output.code, 'utf-8');

			await new Promise((resolve) => {
				const process = spawn(bin, args, { shell: true });

				process.stdout.setEncoding('utf8');
				process.stdout.on('data', this.debug);
				process.stdout.on('error', this.debug);

				process.on('exit', resolve);
			});


			const asset = await readFile(bytecode);

			this.emitFile({
				type: 'asset',
				fileName: `${name}.bundle`,
				source: asset
			});

			this.info(`( ͡° ͜ʖ ͡°) Bytecode compiled to ${name}.bundle`);
		},

		async buildEnd() {
			const temp = join(tmpdir(), 'hermesc');

			if (existsSync(temp)) {
				await rm(temp, { recursive: true, force: true });
			}
		},
	};
}

export = hermesc;