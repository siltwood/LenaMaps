/**
 * UpgradeModal - Shown when user hits daily route limit
 * Prompts anonymous users to sign up, free users to upgrade to Pro
 */

import React from 'react';

const UpgradeModal = ({ isOpen, onClose, usageInfo }) => {
  if (!isOpen) return null;

  const tier = usageInfo?.tier || 'anonymous';
  const dailyLimit = usageInfo?.dailyLimit || 0;

  // Different messages for different tiers
  const getMessage = () => {
    if (tier === 'anonymous') {
      return {
        title: 'Daily Limit Reached',
        message: `You've created ${dailyLimit} routes today. Sign up for a free account to get ${10} routes per day!`,
        primaryButton: 'Sign Up Free',
        primaryAction: 'signup'
      };
    } else if (tier === 'free') {
      return {
        title: 'Daily Limit Reached',
        message: `You've created ${dailyLimit} routes today. Upgrade to Pro for unlimited routes!`,
        primaryButton: 'Upgrade to Pro ($7/month)',
        primaryAction: 'upgrade'
      };
    } else {
      // Shouldn't happen for Pro users, but just in case
      return {
        title: 'Limit Reached',
        message: 'You\'ve reached your daily limit.',
        primaryButton: 'OK',
        primaryAction: 'close'
      };
    }
  };

  const { title, message, primaryButton, primaryAction } = getMessage();

  const handlePrimaryAction = () => {
    if (primaryAction === 'signup') {
      // TODO: Open signup modal when backend is reconnected
      onClose();
    } else if (primaryAction === 'upgrade') {
      // TODO: Open Stripe checkout when backend is reconnected
      onClose();
    } else {
      onClose();
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '32px',
        maxWidth: '400px',
        width: '100%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Icon */}
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: '#fef3c7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
          fontSize: '24px'
        }}>
          🚀
        </div>

        {/* Title */}
        <h2 style={{
          margin: '0 0 8px 0',
          fontSize: '20px',
          fontWeight: '600',
          color: '#111827'
        }}>
          {title}
        </h2>

        {/* Message */}
        <p style={{
          margin: '0 0 24px 0',
          fontSize: '14px',
          color: '#6b7280',
          lineHeight: '1.5'
        }}>
          {message}
        </p>

        {/* Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px'
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              color: '#374151',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#f9fafb';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'white';
            }}
          >
            Maybe Later
          </button>

          <button
            onClick={handlePrimaryAction}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              background: '#3b82f6',
              color: 'white',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#2563eb';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = '#3b82f6';
            }}
          >
            {primaryButton}
          </button>
        </div>

        {/* Fine print */}
        {tier === 'free' && (
          <p style={{
            margin: '16px 0 0 0',
            fontSize: '12px',
            color: '#9ca3af',
            textAlign: 'center'
          }}>
            Cancel anytime. No long-term commitment.
          </p>
        )}
      </div>
    </div>
  );
};

export default UpgradeModal;
