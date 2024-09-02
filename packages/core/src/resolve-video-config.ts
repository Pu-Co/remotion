import type {AnyZodObject} from 'zod';
import type {
	CalcMetadataReturnType,
	CalculateMetadataFunction,
} from './Composition.js';
import {serializeThenDeserializeInStudio} from './input-props-serialization.js';
import type {InferProps} from './props-if-has-props.js';
import {validateDefaultCodec} from './validation/validate-default-codec.js';
import {validateDimension} from './validation/validate-dimensions.js';
import {validateDurationInFrames} from './validation/validate-duration-in-frames.js';
import {validateFps} from './validation/validate-fps.js';
import type {VideoConfig} from './video-config.js';

const validateCalculated = ({
	calculated,
	compositionId,
	compositionFps,
	compositionHeight,
	compositionWidth,
	compositionDurationInFrames,
	compositionBaseFps,
}: {
	calculated: CalcMetadataReturnType<Record<string, unknown>> | null;
	compositionId: string;
	compositionWidth: number | null;
	compositionHeight: number | null;
	compositionFps: number | null;
	compositionBaseFps: number | null;
	compositionDurationInFrames: number | null;
}) => {
	const calculateMetadataErrorLocation = `calculated by calculateMetadata() for the composition "${compositionId}"`;
	const defaultErrorLocation = `of the "<Composition />" component with the id "${compositionId}"`;

	const width = calculated?.width ?? compositionWidth ?? undefined;

	validateDimension(
		width,
		'width',
		calculated?.width ? calculateMetadataErrorLocation : defaultErrorLocation,
	);

	const height = calculated?.height ?? compositionHeight ?? undefined;

	validateDimension(
		height,
		'height',
		calculated?.height ? calculateMetadataErrorLocation : defaultErrorLocation,
	);

	const fps = calculated?.fps ?? compositionFps ?? null;

	validateFps(
		fps,
		calculated?.fps ? calculateMetadataErrorLocation : defaultErrorLocation,
		false,
	);

	const baseFps = calculated?.baseFps ?? compositionBaseFps ?? fps;

	validateFps(
		baseFps,
		calculated?.baseFps ? calculateMetadataErrorLocation : defaultErrorLocation,
		false,
	);

	const durationInFrames =
		calculated?.durationInFrames ?? compositionDurationInFrames ?? null;

	validateDurationInFrames(durationInFrames, {
		allowFloats: false,
		component: `of the "<Composition />" component with the id "${compositionId}"`,
	});

	const defaultCodec = calculated?.defaultCodec;
	validateDefaultCodec(defaultCodec, calculateMetadataErrorLocation);

	return {width, height, fps, baseFps, durationInFrames, defaultCodec};
};

type ResolveVideoConfigParams = {
	compositionId: string;
	compositionWidth: number | null;
	compositionHeight: number | null;
	compositionFps: number | null;
	compositionDurationInFrames: number | null;
	compositionBaseFps: number | null;
	calculateMetadata: CalculateMetadataFunction<
		InferProps<AnyZodObject, Record<string, unknown>>
	> | null;
	signal: AbortSignal;
	defaultProps: Record<string, unknown>;
	originalProps: Record<string, unknown>;
};

export const resolveVideoConfig = ({
	calculateMetadata,
	signal,
	defaultProps,
	originalProps,
	compositionId,
	compositionDurationInFrames,
	compositionFps,
	compositionHeight,
	compositionWidth,
	compositionBaseFps,
}: ResolveVideoConfigParams): VideoConfig | Promise<VideoConfig> => {
	const calculatedProm = calculateMetadata
		? calculateMetadata({
				defaultProps,
				props: originalProps,
				abortSignal: signal,
				compositionId,
			})
		: null;

	if (
		calculatedProm !== null &&
		typeof calculatedProm === 'object' &&
		'then' in calculatedProm
	) {
		return calculatedProm.then((c) => {
			const {height, width, durationInFrames, fps, baseFps, defaultCodec} =
				validateCalculated({
					calculated: c,
					compositionDurationInFrames,
					compositionFps,
					compositionHeight,
					compositionWidth,
					compositionId,
					compositionBaseFps,
				});
			return {
				width,
				height,
				fps,
				baseFps,
				durationInFrames,
				id: compositionId,
				defaultProps: serializeThenDeserializeInStudio(defaultProps),
				props: serializeThenDeserializeInStudio(c.props ?? originalProps),
				defaultCodec: defaultCodec ?? null,
			};
		});
	}

	const data = validateCalculated({
		calculated: calculatedProm,
		compositionDurationInFrames,
		compositionFps,
		compositionHeight,
		compositionWidth,
		compositionId,
		compositionBaseFps,
	});

	if (calculatedProm === null) {
		return {
			...data,
			id: compositionId,
			defaultProps: serializeThenDeserializeInStudio(defaultProps ?? {}),
			props: serializeThenDeserializeInStudio(originalProps),
			defaultCodec: null,
		};
	}

	return {
		...data,
		id: compositionId,
		defaultProps: serializeThenDeserializeInStudio(defaultProps ?? {}),
		props: serializeThenDeserializeInStudio(
			calculatedProm.props ?? originalProps,
		),
		defaultCodec: calculatedProm.defaultCodec ?? null,
	};
};

export const resolveVideoConfigOrCatch = (
	params: ResolveVideoConfigParams,
):
	| {
			type: 'success';
			result: VideoConfig | Promise<VideoConfig>;
	  }
	| {
			type: 'error';
			error: Error;
	  } => {
	try {
		const promiseOrReturnValue = resolveVideoConfig(params);
		return {
			type: 'success',
			result: promiseOrReturnValue,
		};
	} catch (err) {
		return {
			type: 'error',
			error: err as Error,
		};
	}
};
