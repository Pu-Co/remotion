import type {LogLevel, MediaFn, OnVideoTrack} from '@remotion/media-parser';
import type {ConvertMediaVideoCodec} from './codec-id';
import {convertEncodedChunk} from './convert-encoded-chunk';
import type {
	ConvertMediaContainer,
	ConvertMediaOnMediaStateUpdate,
	ConvertMediaOnVideoFrame,
	ConvertMediaState,
} from './convert-media';
import {defaultOnVideoTrackHandler} from './default-on-video-track-handler';
import Error from './error-cause';
import {onFrame} from './on-frame';
import type {ConvertMediaOnVideoTrackHandler} from './on-video-track-handler';
import {createVideoDecoder} from './video-decoder';
import {getVideoDecoderConfigWithHardwareAcceleration} from './video-decoder-config';
import {createVideoEncoder} from './video-encoder';
import {getVideoEncoderConfig} from './video-encoder-config';

export const makeVideoTrackHandler =
	({
		state,
		onVideoFrame,
		onMediaStateUpdate,
		abortConversion,
		convertMediaState,
		controller,
		defaultVideoCodec,
		onVideoTrack,
		logLevel,
		container,
	}: {
		state: MediaFn;
		onVideoFrame: null | ConvertMediaOnVideoFrame;
		onMediaStateUpdate: null | ConvertMediaOnMediaStateUpdate;
		abortConversion: (errCause: Error) => void;
		convertMediaState: ConvertMediaState;
		controller: AbortController;
		defaultVideoCodec: ConvertMediaVideoCodec | null;
		onVideoTrack: ConvertMediaOnVideoTrackHandler | null;
		logLevel: LogLevel;
		container: ConvertMediaContainer;
	}): OnVideoTrack =>
	async (track) => {
		if (controller.signal.aborted) {
			throw new Error('Aborted');
		}

		const videoOperation = await (onVideoTrack ?? defaultOnVideoTrackHandler)({
			track,
			defaultVideoCodec,
			logLevel,
			container,
		});

		if (videoOperation.type === 'drop') {
			return null;
		}

		if (videoOperation.type === 'fail') {
			throw new Error(
				`Video track with ID ${track.trackId} could resolved with {"type": "fail"}. This could mean that this video track could neither be copied to the output container or re-encoded. You have the option to drop the track instead of failing it: https://remotion.dev/docs/webcodecs/track-transformation`,
			);
		}

		if (videoOperation.type === 'copy') {
			const videoTrack = await state.addTrack({
				type: 'video',
				color: track.color,
				width: track.codedWidth,
				height: track.codedHeight,
				codec: track.codecWithoutConfig,
				codecPrivate: track.codecPrivate,
			});
			return async (sample) => {
				await state.addSample(sample, videoTrack.trackNumber, true);
				convertMediaState.decodedVideoFrames++;
				onMediaStateUpdate?.({...convertMediaState});
			};
		}

		const videoEncoderConfig = await getVideoEncoderConfig({
			codec: videoOperation.videoCodec,
			height: track.displayAspectHeight,
			width: track.displayAspectWidth,
		});
		const videoDecoderConfig =
			await getVideoDecoderConfigWithHardwareAcceleration(track);

		if (videoEncoderConfig === null) {
			abortConversion(
				new Error(
					`Could not configure video encoder of track ${track.trackId}`,
				),
			);
			return null;
		}

		if (videoDecoderConfig === null) {
			abortConversion(
				new Error(
					`Could not configure video decoder of track ${track.trackId}`,
				),
			);
			return null;
		}

		const {trackNumber} = await state.addTrack({
			type: 'video',
			color: track.color,
			width: track.codedWidth,
			height: track.codedHeight,
			codec: videoOperation.videoCodec,
			codecPrivate: null,
		});

		const videoEncoder = createVideoEncoder({
			onChunk: async (chunk) => {
				await state.addSample(convertEncodedChunk(chunk), trackNumber, true);
				convertMediaState.encodedVideoFrames++;
				onMediaStateUpdate?.({...convertMediaState});
			},
			onError: (err) => {
				abortConversion(
					new Error(
						`Video encoder of track ${track.trackId} failed (see .cause of this error)`,
						{
							cause: err,
						},
					),
				);
			},
			signal: controller.signal,
			config: videoEncoderConfig,
			logLevel,
		});

		const videoDecoder = createVideoDecoder({
			config: videoDecoderConfig,
			onFrame: async (frame) => {
				await onFrame({
					convertMediaState,
					frame,
					onMediaStateUpdate,
					track,
					videoEncoder,
					onVideoFrame,
				});
			},
			onError: (err) => {
				abortConversion(
					new Error(
						`Video decoder of track ${track.trackId} failed (see .cause of this error)`,
						{
							cause: err,
						},
					),
				);
			},
			signal: controller.signal,
			logLevel,
		});

		state.addWaitForFinishPromise(async () => {
			await videoDecoder.waitForFinish();
			await videoEncoder.waitForFinish();
			videoDecoder.close();
			videoEncoder.close();
		});

		return async (chunk) => {
			await videoDecoder.processSample(chunk);
		};
	};
