import bgImage from '../assets/bg.jpg';

export const EXPERIENCE_COLORS = {
  text: '#f0f0f0',
  mutedText: '#a8aab6',
  subtleText: '#7a7c88',
  accent: '#ff5c35',
  info: '#5b9cf6',
  success: '#3ddc84',
  warning: '#f5a623',
  danger: '#ff8c6b',
  panelBg: 'rgba(0,0,0,0.55)',
  panelBgStrong: 'rgba(10,11,16,0.78)',
  border: 'rgba(255,255,255,0.18)',
};

const DIFFICULTY_ACCENTS = {
  easy: EXPERIENCE_COLORS.success,
  medium: EXPERIENCE_COLORS.warning,
  hard: EXPERIENCE_COLORS.accent,
};

export function getDifficultyAccent(difficulty) {
  const key = typeof difficulty === 'string' ? difficulty.toLowerCase() : '';
  return DIFFICULTY_ACCENTS[key] || EXPERIENCE_COLORS.accent;
}

export const experiencePageStyle = {
  minHeight: '100vh',
  color: EXPERIENCE_COLORS.text,
  fontFamily: 'Inter, sans-serif',
  backgroundImage: `url(${bgImage})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center top',
  backgroundAttachment: 'fixed',
  position: 'relative',
};

export const experienceOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(5,5,8,0.80)',
  zIndex: 0,
  pointerEvents: 'none',
};

export const experienceNavStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 40px',
  height: 56,
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  background: 'rgba(5,5,8,0.55)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  zIndex: 10,
};

export const experienceContentStyle = {
  position: 'relative',
  zIndex: 1,
  maxWidth: 1180,
  margin: '0 auto',
  padding: '104px 40px 64px',
};

export const sectionEyebrowStyle = {
  color: EXPERIENCE_COLORS.accent,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
};

const baseButtonStyle = {
  padding: '8px 18px',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  transition: 'opacity 0.15s, border-color 0.15s, color 0.15s',
};

export const primaryButtonStyle = {
  ...baseButtonStyle,
  background: EXPERIENCE_COLORS.accent,
  color: '#fff',
  border: `1px solid ${EXPERIENCE_COLORS.accent}`,
};

export const secondaryButtonStyle = {
  ...baseButtonStyle,
  background: 'transparent',
  color: '#c8c9d1',
  border: '1px solid #333',
};

export function buildGlassPanelStyle({
  padding = 24,
  background = EXPERIENCE_COLORS.panelBg,
  borderColor = EXPERIENCE_COLORS.border,
  borderRadius = 18,
} = {}) {
  return {
    padding,
    background,
    backdropFilter: 'blur(40px) saturate(180%)',
    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
    border: `1px solid ${borderColor}`,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)',
    borderRadius,
  };
}

export function buildTagStyle(color, background) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderRadius: 999,
    background,
    color,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  };
}
