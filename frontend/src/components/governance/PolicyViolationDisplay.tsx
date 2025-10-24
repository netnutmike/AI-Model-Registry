import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
} from '@mui/material';
import {
  ExpandMore,
  Error,
  Warning,
  Info,
  CheckCircle,
} from '@mui/icons-material';
import { PolicyViolation } from '@/services/governance';

interface PolicyViolationDisplayProps {
  violations: PolicyViolation[];
  showActions?: boolean;
  onOverride?: (violationId: string) => void;
}

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'critical':
      return <Error color="error" />;
    case 'high':
      return <Error color="error" />;
    case 'medium':
      return <Warning color="warning" />;
    case 'low':
      return <Info color="info" />;
    default:
      return <Warning />;
  }
};

const getSeverityColor = (severity: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (severity) {
    case 'critical':
      return 'error';
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
      return 'info';
    default:
      return 'default';
  }
};

export const PolicyViolationDisplay: React.FC<PolicyViolationDisplayProps> = ({
  violations,
  showActions = false,
  onOverride,
}) => {
  if (violations.length === 0) {
    return (
      <Alert severity="success" icon={<CheckCircle />}>
        No policy violations found. All governance requirements are met.
      </Alert>
    );
  }

  const criticalViolations = violations.filter(v => v.severity === 'critical');
  const highViolations = violations.filter(v => v.severity === 'high');
  const mediumViolations = violations.filter(v => v.severity === 'medium');
  const lowViolations = violations.filter(v => v.severity === 'low');

  const groupedViolations = [
    { severity: 'critical', violations: criticalViolations, label: 'Critical' },
    { severity: 'high', violations: highViolations, label: 'High' },
    { severity: 'medium', violations: mediumViolations, label: 'Medium' },
    { severity: 'low', violations: lowViolations, label: 'Low' },
  ].filter(group => group.violations.length > 0);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h6">
          Policy Violations ({violations.length})
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {groupedViolations.map(group => (
            <Chip
              key={group.severity}
              label={`${group.violations.length} ${group.label}`}
              color={getSeverityColor(group.severity)}
              size="small"
            />
          ))}
        </Box>
      </Box>

      {criticalViolations.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          This model has {criticalViolations.length} critical violation(s) that must be resolved before deployment.
        </Alert>
      )}

      {groupedViolations.map(group => (
        <Accordion key={group.severity} defaultExpanded={group.severity === 'critical'}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {getSeverityIcon(group.severity)}
              <Typography variant="subtitle1">
                {group.label} Severity ({group.violations.length})
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              {group.violations.map((violation) => (
                <ListItem
                  key={violation.id}
                  divider
                  secondaryAction={
                    showActions && violation.canOverride && !violation.overriddenBy && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => onOverride?.(violation.id)}
                      >
                        Override
                      </Button>
                    )
                  }
                >
                  <ListItemIcon>
                    {getSeverityIcon(violation.severity)}
                  </ListItemIcon>
                  <ListItemText
                    primary={violation.policyName}
                    secondary={
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          {violation.message}
                        </Typography>
                        {violation.overriddenBy && (
                          <Box sx={{ mt: 1 }}>
                            <Chip
                              label="Overridden"
                              color="warning"
                              size="small"
                              sx={{ mr: 1 }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              By {violation.overriddenBy} - {violation.overrideReason}
                            </Typography>
                          </Box>
                        )}
                        {!violation.canOverride && (
                          <Typography variant="caption" color="error">
                            Cannot be overridden
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};