import type {ConvertMediaAudioCodec} from './codec-id';
import type {ConvertMediaContainer} from './convert-media';

export const getDefaultAudioCodec = ({
	container,
}: {
	container: ConvertMediaContainer;
}): ConvertMediaAudioCodec => {
	if (container === 'webm') {
		return 'opus';
	}

	throw new Error(`Unhandled container: ${container satisfies never}`);
};
