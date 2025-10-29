/**
 * UI Design System Constants
 *
 * Centralized design tokens for consistent UI across the application.
 * Use these instead of hardcoded values in inline styles.
 */

// ============================================================================
// COLORS
// ============================================================================

export const COLORS = {
  // Primary
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  primaryLight: '#e8f0fe',

  // Semantic colors
  success: '#10b981',
  successDark: '#059669',
  warning: '#f59e0b',
  warningDark: '#d97706',
  danger: '#ef4444',
  dangerDark: '#dc2626',

  // Text - All black for uniformity
  textPrimary: '#000000',
  textSecondary: '#000000',
  textLight: '#000000',
  textMuted: '#000000',

  // Backgrounds
  bgWhite: '#ffffff',
  bgGray: '#f8fafc',
  bgGrayHover: '#f1f5f9',
  bgGrayLight: '#f9fafb',

  // Borders
  border: '#e2e8f0',
  borderHover: '#cbd5e1',
  borderLight: '#e5e7eb',
  borderDark: '#d1d5db',
};

// ============================================================================
// SPACING
// ============================================================================

export const SPACING = {
  xxs: '2px',
  xs: '4px',
  sm: '6px',
  md: '8px',
  base: '12px',
  lg: '16px',
  xl: '20px',
  xxl: '24px',
};

// Compact spacing (for dense UIs)
export const COMPACT_SPACING = {
  xxs: '1px',
  xs: '2px',
  sm: '4px',
  md: '6px',
  base: '8px',
  lg: '10px',
  xl: '12px',
  xxl: '16px',
};

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const FONT_SIZES = {
  xxs: '10px',   // Smallest (labels, captions)
  xs: '11px',    // Small (secondary text)
  sm: '12px',    // Body small
  base: '13px',  // Base body text
  md: '14px',    // Medium (emphasis)
  lg: '15px',    // Large (headers)
  xl: '16px',    // Extra large (main headers)
  xxl: '18px',   // Very large
  xxxl: '20px',  // Largest
};

export const FONT_WEIGHTS = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

export const LINE_HEIGHTS = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
};

// ============================================================================
// BORDER RADIUS
// ============================================================================

export const RADIUS = {
  none: '0',
  xs: '2px',
  sm: '4px',
  md: '6px',
  base: '8px',
  lg: '10px',
  xl: '12px',
  xxl: '16px',
  full: '9999px',
};

// ============================================================================
// SHADOWS
// ============================================================================

export const SHADOWS = {
  none: 'none',
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px rgba(0, 0, 0, 0.15)',
};

// ============================================================================
// TRANSITIONS
// ============================================================================

export const TRANSITIONS = {
  fast: '0.1s ease',
  base: '0.2s ease',
  slow: '0.3s ease',
  all: 'all 0.2s ease',
};

// ============================================================================
// Z-INDEX
// ============================================================================

export const Z_INDEX = {
  base: 1,
  dropdown: 100,
  modal: 1000,
  tooltip: 1500,
  animator: 2000,
  panel: 2000,
  max: 9999,
};

// ============================================================================
// COMPONENT-SPECIFIC CONSTANTS
// ============================================================================

// Compact button sizing
export const BUTTON_COMPACT = {
  height: '28px',
  padding: `${COMPACT_SPACING.xs} ${COMPACT_SPACING.base}`,
  fontSize: FONT_SIZES.base,
  gap: COMPACT_SPACING.xs,
};

// Compact input sizing
export const INPUT_COMPACT = {
  height: '32px',
  padding: `${COMPACT_SPACING.sm} ${COMPACT_SPACING.md}`,
  fontSize: FONT_SIZES.base,
};

// Compact radio/checkbox button sizing
export const RADIO_COMPACT = {
  minHeight: '40px',
  padding: `${COMPACT_SPACING.sm} ${COMPACT_SPACING.md}`,
  fontSize: FONT_SIZES.base,
  smallFontSize: FONT_SIZES.xs,
};

// Panel sizing
export const PANEL = {
  padding: SPACING.base,
  headerPadding: SPACING.md,
  borderRadius: RADIUS.lg,
  maxWidth: '380px',
};

// ============================================================================
// BREAKPOINTS
// ============================================================================

export const BREAKPOINTS = {
  mobile: '768px',
  tablet: '1024px',
  desktop: '1280px',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a style object for inline styles
 */
export const createCompactButtonStyle = (variant = 'primary') => {
  const baseStyle = {
    padding: BUTTON_COMPACT.padding,
    fontSize: BUTTON_COMPACT.fontSize,
    fontWeight: FONT_WEIGHTS.medium,
    borderRadius: RADIUS.md,
    border: 'none',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: BUTTON_COMPACT.gap,
    transition: TRANSITIONS.all,
    height: BUTTON_COMPACT.height,
  };

  const variants = {
    primary: {
      backgroundColor: COLORS.primary,
      color: COLORS.bgWhite,
    },
    success: {
      backgroundColor: COLORS.success,
      color: COLORS.bgWhite,
    },
    danger: {
      backgroundColor: COLORS.danger,
      color: COLORS.bgWhite,
    },
    warning: {
      backgroundColor: COLORS.warning,
      color: COLORS.bgWhite,
    },
    secondary: {
      backgroundColor: COLORS.bgGray,
      color: COLORS.textPrimary,
      border: `1px solid ${COLORS.border}`,
    },
  };

  return { ...baseStyle, ...variants[variant] };
};

/**
 * Create style object for compact radio buttons
 */
export const createCompactRadioStyle = (isActive = false) => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: RADIO_COMPACT.padding,
  border: `1.5px solid ${isActive ? COLORS.primary : COLORS.border}`,
  borderRadius: RADIUS.md,
  cursor: 'pointer',
  transition: TRANSITIONS.all,
  backgroundColor: isActive ? COLORS.primaryLight : COLORS.bgWhite,
  minHeight: RADIO_COMPACT.minHeight,
});

export default {
  COLORS,
  SPACING,
  COMPACT_SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  LINE_HEIGHTS,
  RADIUS,
  SHADOWS,
  TRANSITIONS,
  Z_INDEX,
  BUTTON_COMPACT,
  INPUT_COMPACT,
  RADIO_COMPACT,
  PANEL,
  BREAKPOINTS,
  createCompactButtonStyle,
  createCompactRadioStyle,
};
