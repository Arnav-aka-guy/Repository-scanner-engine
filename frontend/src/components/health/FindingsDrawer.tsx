import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  AlertCircle,
  FileCode,
  MessageSquare,
  CheckCircle,
  HelpCircle,
  Undo2,
} from 'lucide-react';
import { Finding } from './HealthTypes';
import { colors, radius, font } from '../../design-system/tokens';
import { Badge, Button, FilePath } from '../../design-system/primitives';

interface FindingsDrawerProps {
  finding: Finding | null;
  onClose: () => void;
  onOpenFile: (path: string) => void;
  onAskAI: (message: string, file: string) => void;
  onDismiss: (id: string, reason: string) => void;
  onUndismiss: (id: string) => void;
}

export const FindingsDrawer: React.FC<FindingsDrawerProps> = ({
  finding,
  onClose,
  onOpenFile,
  onAskAI,
  onDismiss,
  onUndismiss,
}) => {
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissReason, setDismissReason] = useState('');

  if (!finding) return null;

  const handleConfirmDismiss = () => {
    if (!dismissReason.trim()) return;
    onDismiss(finding.id, dismissReason.trim());
    setIsDismissing(false);
    setDismissReason('');
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'critical':
        return <Badge variant="red">Critical</Badge>;
      case 'high':
        return <Badge variant="yellow">High Severity</Badge>;
      case 'medium':
        return <Badge variant="blue">Medium Severity</Badge>;
      default:
        return <Badge variant="default">Low Severity</Badge>;
    }
  };

  const getConfidenceBadge = (conf: string) => {
    switch (conf) {
      case 'high':
        return <Badge variant="green">High Confidence (1.0×)</Badge>;
      case 'medium':
        return <Badge variant="yellow">Medium Confidence (0.6×)</Badge>;
      default:
        return <Badge variant="default">Low Confidence (0.3×)</Badge>;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '540px',
          maxWidth: '100%',
          height: '100%',
          backgroundColor: colors.bg.surface,
          borderLeft: `1px solid ${colors.border.default}`,
          boxShadow: '-8px 0 24px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${colors.border.default}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.bg.surfaceSecondary,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {finding.severity === 'critical' ? (
              <AlertCircle size={18} style={{ color: colors.status.danger }} />
            ) : (
              <AlertTriangle size={18} style={{ color: colors.status.warning }} />
            )}
            <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text.primary }}>
              Finding Detail
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: colors.text.muted,
              cursor: 'pointer',
              padding: '4px',
              borderRadius: radius.sm,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '20px',
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* Title & Rule */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text.primary }}>
              {finding.title}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: font.size.xs, fontFamily: font.mono, color: colors.text.muted }}>
                Rule: {finding.rule_id}
              </span>
              {getSeverityBadge(finding.severity)}
              {getConfidenceBadge(finding.confidence)}
            </div>
          </div>

          {/* Score Impact Card */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: colors.bg.elevated,
              borderRadius: radius.md,
              border: `1px solid ${colors.border.subtle}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: font.size.xs, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Score Impact
              </span>
              <span style={{ fontSize: font.size.sm, color: colors.text.secondary }}>
                Deduction applied to overall codebase health
              </span>
            </div>
            <div
              style={{
                fontSize: font.size.xl,
                fontWeight: font.weight.bold,
                fontFamily: font.mono,
                color: finding.dismissed ? colors.text.muted : colors.status.danger,
              }}
            >
              {finding.dismissed ? '0 pts (dismissed)' : `-${finding.score_effect} pts`}
            </div>
          </div>

          {/* Location */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: colors.text.muted, textTransform: 'uppercase' }}>
              Location in Repository
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                backgroundColor: colors.bg.primary,
                borderRadius: radius.md,
                border: `1px solid ${colors.border.default}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                <FileCode size={16} style={{ color: colors.text.muted, flexShrink: 0 }} />
                <FilePath path={finding.file_path} showFull />
                {finding.line_number > 0 && (
                  <span style={{ fontSize: font.size.xs, fontFamily: font.mono, color: colors.accent.blue, flexShrink: 0 }}>
                    :line {finding.line_number}
                  </span>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onOpenFile(finding.file_path)}
                style={{ flexShrink: 0 }}
              >
                Open in Explorer
              </Button>
            </div>
          </div>

          {/* Explanation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: colors.text.muted, textTransform: 'uppercase' }}>
              Why It Matters & Technical Context
            </span>
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: colors.bg.surfaceSecondary,
                borderRadius: radius.md,
                border: `1px solid ${colors.border.subtle}`,
                fontSize: font.size.sm,
                color: colors.text.secondary,
                lineHeight: '1.6',
              }}
            >
              {finding.why_it_matters}
            </div>
          </div>

          {/* Dismissal Status or Actions */}
          {finding.dismissed ? (
            <div
              style={{
                padding: '14px',
                backgroundColor: 'rgba(76, 175, 121, 0.08)',
                borderRadius: radius.md,
                border: `1px solid rgba(76, 175, 121, 0.2)`,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={16} style={{ color: colors.status.success }} />
                  <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.status.success }}>
                    Finding Dismissed
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onUndismiss(finding.id)}
                  icon={<Undo2 size={13} />}
                >
                  Restore
                </Button>
              </div>
              {finding.dismiss_reason && (
                <div style={{ fontSize: font.size.xs, color: colors.text.muted }}>
                  Reason provided: <span style={{ color: colors.text.secondary }}>"{finding.dismiss_reason}"</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {isDismissing ? (
                <div
                  style={{
                    padding: '14px',
                    backgroundColor: colors.bg.elevated,
                    borderRadius: radius.md,
                    border: `1px solid ${colors.border.default}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <HelpCircle size={15} style={{ color: colors.status.warning }} />
                    <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: colors.text.primary }}>
                      Reason for dismissal (required by health audit rules)
                    </span>
                  </div>
                  <input
                    type="text"
                    value={dismissReason}
                    onChange={(e) => setDismissReason(e.target.value)}
                    placeholder="e.g., Intentional pattern, legacy module scheduled for deprecation..."
                    style={{
                      padding: '6px 10px',
                      fontSize: font.size.sm,
                      borderRadius: radius.sm,
                      backgroundColor: colors.bg.primary,
                      border: `1px solid ${colors.border.strong}`,
                      color: colors.text.primary,
                      outline: 'none',
                    }}
                    autoFocus
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsDismissing(false);
                        setDismissReason('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!dismissReason.trim()}
                      onClick={handleConfirmDismiss}
                    >
                      Confirm Dismissal
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => onAskAI(finding.title, finding.file_path)}
                    icon={<MessageSquare size={14} />}
                    style={{ flex: 1 }}
                  >
                    Ask AI to Refactor
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => setIsDismissing(true)}
                  >
                    Dismiss Finding
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
