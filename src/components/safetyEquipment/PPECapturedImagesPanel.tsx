import React from 'react';
import { SafetyCapturedImages } from './SafetyCapturedImages';
import type { SafetyCapturedImagesProps } from './SafetyCapturedImages';

export type PPECapturedImagesPanelProps = SafetyCapturedImagesProps;

export const PPECapturedImagesPanel: React.FC<PPECapturedImagesPanelProps> = (props) => {
  return <SafetyCapturedImages {...props} />;
};
