import {createContext, useContext} from 'react';

export type MediaVolumeContextValue = {
	mediaMuted: boolean;
	mediaVolume: number;
};

export type SetMediaVolumeContextValue = {
	setMediaMuted: (u: React.SetStateAction<boolean>) => void;
	setMediaVolume: (u: React.SetStateAction<number>) => void;
};

export const MeidaVolumeContext = createContext<MediaVolumeContextValue>({
	mediaMuted: false,
	mediaVolume: 1,
});

export const SetMediaVolumeContext = createContext<SetMediaVolumeContextValue>({
	setMediaMuted: () => {
		throw new Error('default');
	},
	setMediaVolume: () => {
		throw new Error('default');
	},
});

type MediaVolumeReturnType = readonly [
	number,
	(u: React.SetStateAction<number>) => void
];

export const useMediaVolumeState = (): MediaVolumeReturnType => {
	const {mediaVolume} = useContext(MeidaVolumeContext);
	const {setMediaVolume} = useContext(SetMediaVolumeContext);
	return [mediaVolume, setMediaVolume];
};

type MediaMutedReturnType = readonly [
	boolean,
	(u: React.SetStateAction<boolean>) => void
];

export const useMediaMutedState = (): MediaMutedReturnType => {
	const {mediaMuted} = useContext(MeidaVolumeContext);
	const {setMediaMuted} = useContext(SetMediaVolumeContext);
	return [mediaMuted, setMediaMuted];
};
