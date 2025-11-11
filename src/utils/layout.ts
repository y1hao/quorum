export interface NodePosition {
  id: string;
  x: number;
  y: number;
  angle: number;
}

export const computeNodePositions = (
  ids: string[],
  radius: number,
  cx: number,
  cy: number
): Record<string, NodePosition> => {
  const count = ids.length || 1;
  const angleStep = (Math.PI * 2) / count;
  const positions: Record<string, NodePosition> = {};

  ids.forEach((id, index) => {
    const angle = index * angleStep - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    positions[id] = { id, x, y, angle };
  });

  return positions;
};
