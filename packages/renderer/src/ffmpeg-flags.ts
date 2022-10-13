import execa from 'execa';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {_downloadFile} from './browser/BrowserFetcher';
import type {FfmpegExecutable} from './ffmpeg-executable';
import {binaryExists} from './validate-ffmpeg';

let buildConfig: string | null = null;
const listeners: Record<string, ((path: string) => void)[]> = {};
const isDownloading: Record<string, boolean> = {};

export type FfmpegVersion = [number, number, number] | null;

export const getFfmpegBuildInfo = async (
	options: {
		ffmpegExecutable: string | null;
	},
	remotionRoot: string
) => {
	if (buildConfig !== null) {
		return buildConfig;
	}

	const data = await execa(
		await getExecutableFfmpeg(options.ffmpegExecutable, remotionRoot),
		['-buildconf'],
		{
			reject: false,
		}
	);
	buildConfig = data.stderr;
	return buildConfig;
};

const getFfmpegFolderName = (remotionRoot: string): string => {
	return path.resolve(remotionRoot, 'node_modules/.ffmpeg');
};

const ffmpegBinaryPrefix = 'ffmpeg-';
const randomFfmpegRuntimeId = String(Math.random()).replace('0.', '');

export const ffmpegInNodeModules = (remotionRoot: string): string | null => {
	const folderName = getFfmpegFolderName(remotionRoot);
	if (!fs.existsSync(folderName)) {
		fs.mkdirSync(folderName);
	}

	// Check if a version of FFMPEG is already installed.
	// To qualify, it must have the expected file size
	// to avoid finding binaries that are still being downloaded
	// A random ID is being assigned to the download to avoid conflicts when multiple Remotion processes are running
	const ffmpegInstalled = fs.readdirSync(folderName).find((filename) => {
		if (!filename.startsWith(ffmpegBinaryPrefix)) {
			return false;
		}

		const expectedLength = getFfmpegDownloadUrl().contentLength;

		if (fs.statSync(path.join(folderName, filename)).size === expectedLength) {
			return true;
		}

		return false;
	});

	if (ffmpegInstalled) {
		return path.join(folderName, ffmpegInstalled);
	}

	return null;
};

const getFfmpegAbsolutePath = (remotionRoot: string): string => {
	const folderName = getFfmpegFolderName(remotionRoot);
	if (!fs.existsSync(folderName)) {
		fs.mkdirSync(folderName);
	}

	if (os.platform() === 'win32') {
		return path.resolve(
			folderName,
			`${ffmpegBinaryPrefix}${randomFfmpegRuntimeId}.exe`
		);
	}

	return path.resolve(
		folderName,
		`${ffmpegBinaryPrefix}${randomFfmpegRuntimeId}`
	);
};

export const ffmpegHasFeature = async ({
	ffmpegExecutable,
	feature,
	remotionRoot,
}: {
	ffmpegExecutable: string | null;
	feature: 'enable-gpl' | 'enable-libx265' | 'enable-libvpx';
	remotionRoot: string;
}) => {
	if (!(await binaryExists('ffmpeg', ffmpegExecutable))) {
		return false;
	}

	const config = await getFfmpegBuildInfo({ffmpegExecutable}, remotionRoot);
	return config.includes(feature);
};

export const parseFfmpegVersion = (buildconf: string): FfmpegVersion => {
	const match = buildconf.match(
		/ffmpeg version ([0-9]+).([0-9]+)(?:.([0-9]+))?/
	);
	if (!match) {
		return null;
	}

	return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
};

export const getFfmpegVersion = async (
	options: {
		ffmpegExecutable: string | null;
	},
	remotionRoot: string
): Promise<FfmpegVersion> => {
	const buildInfo = await getFfmpegBuildInfo(
		{
			ffmpegExecutable: options.ffmpegExecutable,
		},
		remotionRoot
	);
	return parseFfmpegVersion(buildInfo);
};

const waitForFfmpegToBeDownloaded = (url: string) => {
	return new Promise<string>((resolve) => {
		if (!listeners[url]) {
			listeners[url] = [];
		}

		listeners[url].push((src) => resolve(src));
	});
};

const onProgress = (downloadedBytes: number, totalBytesToDownload: number) => {
	console.log(
		'Downloading FFmpeg: ',
		`${toMegabytes(downloadedBytes)}/${toMegabytes(totalBytesToDownload)}`
	);
};

export const downloadFfmpeg = async (
	remotionRoot: string,
	url: string
): Promise<string> => {
	const destinationPath = getFfmpegAbsolutePath(remotionRoot);

	isDownloading[url] = true;
	const totalBytes = await _downloadFile(url, destinationPath, onProgress);
	onProgress(totalBytes, totalBytes);
	if (os.platform() !== 'win32') {
		fs.chmodSync(destinationPath, '755');
	}

	isDownloading[url] = false;
	if (!listeners[url]) {
		listeners[url] = [];
	}

	listeners[url].forEach((listener) => listener(destinationPath));
	listeners[url] = [];

	return destinationPath;
};

export const getExecutableFfmpeg = async (
	ffmpegExecutable: FfmpegExecutable | null,
	remotionRoot: string
) => {
	const exists = await binaryExists('ffmpeg', ffmpegExecutable);

	if (exists) {
		if (ffmpegExecutable !== null) {
			return ffmpegExecutable;
		}

		return 'ffmpeg';
	}

	const {url} = getFfmpegDownloadUrl();

	if (isDownloading[url]) {
		return waitForFfmpegToBeDownloaded(url);
	}

	const inNodeMod = ffmpegInNodeModules(remotionRoot);

	if (inNodeMod) {
		return inNodeMod;
	}

	return downloadFfmpeg(remotionRoot, url);
};

function toMegabytes(bytes: number) {
	const mb = bytes / 1024 / 1024;
	return `${Math.round(mb * 10) / 10} Mb`;
}

export const getFfmpegDownloadUrl = (): {
	url: string;
	contentLength: number;
} => {
	if (os.platform() === 'win32') {
		return {
			url: 'https://remotion-ffmpeg-binaries.s3.eu-central-1.amazonaws.com/ffmpeg-win-x86.exe',
			contentLength: 127531008,
		};
	}

	if (os.platform() === 'darwin') {
		return process.arch === 'arm64'
			? {
					url: 'https://remotion-ffmpeg-binaries.s3.eu-central-1.amazonaws.com/ffmpeg-macos-arm64',
					contentLength: 42093320,
			  }
			: {
					url: 'https://remotion-ffmpeg-binaries.s3.eu-central-1.amazonaws.com/ffmpeg-macos-x86',
					contentLength: 78380700,
			  };
	}

	return {
		url: 'https://remotion-ffmpeg-binaries.s3.eu-central-1.amazonaws.com/ffmpeg-linux-amd64',
		contentLength: 78502560,
	};
};
