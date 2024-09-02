import {useContext, useMemo} from 'react';
import {SequenceContext} from './SequenceContext.js';
import {useVideo} from './use-video.js';
import type {VideoConfig} from './video-config.js';

export const useUnsafeVideoConfig = (): VideoConfig | null => {
	const context = useContext(SequenceContext);
	const ctxWidth = context?.width ?? null;
	const ctxHeight = context?.height ?? null;
	const ctxDuration = context?.durationInFrames ?? null;
	const video = useVideo();

	return useMemo(() => {
		if (!video) {
			return null;
		}

		const {
			id,
			durationInFrames,
			fps,
			baseFps,
			height,
			width,
			defaultProps,
			props,
			defaultCodec,
		} = video;

		return {
			id,
			width: ctxWidth ?? width,
			height: ctxHeight ?? height,
			fps,
			baseFps,
			durationInFrames: ctxDuration ?? durationInFrames,
			defaultProps,
			props,
			defaultCodec,
		};
	}, [ctxDuration, ctxHeight, ctxWidth, video]);
};
