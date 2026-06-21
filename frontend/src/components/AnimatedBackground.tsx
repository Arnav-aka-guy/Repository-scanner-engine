import React from 'react';

/**
 * AnimatedBackground — Full-screen ambient gradient mesh.
 * Pure CSS animation, no JS runtime cost. Renders floating gradient
 * orbs and a subtle dot-grid overlay behind all page content.
 */
export const AnimatedBackground: React.FC = () => {
  return (
    <>
      <div className="animated-bg" aria-hidden="true">
        <div className="animated-bg-orb3" />
      </div>
      <div className="dot-grid" aria-hidden="true" />
    </>
  );
};
