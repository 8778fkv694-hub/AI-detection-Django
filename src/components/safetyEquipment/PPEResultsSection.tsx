import React from 'react';
import { PPEResultsCard } from './PPEResultsCard';
import type { PPEResultsCardProps } from './PPEResultsCard';

export type PPEResultsSectionProps = PPEResultsCardProps;

export const PPEResultsSection: React.FC<PPEResultsSectionProps> = (props) => {
  return <PPEResultsCard {...props} />;
};
