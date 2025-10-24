import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Divider,
  Alert,
} from '@mui/material';
import { Warning, Error } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApprovalRequest, ApprovalAction } from '@/services/governance';

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_changes']),
  comments: z.string().optional(),
  overrides: z.array(z.object({
    violationId: z.string(),
    reason: z.string().min(1, 'Override reason is required'),
  })).optional(),
});

type ReviewFormData = z.infer<typeof reviewSchema>;

interface ApprovalReviewDialogProps {
  open: boolean;
  approval: ApprovalRequest | null;
  onClose: () => void;
  onSubmit: (action: ApprovalAction) => void;
  isLoading?: boolean;
}

export const ApprovalReviewDialog: React.FC<ApprovalReviewDialogProps> = ({
  open,
  approval,
  onClose,
  onSubmit,
  isLoading = false,
}) => {
  const [selectedOverrides, setSelectedOverrides] = useState<Set<string>>(new Set());

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      action: 'approve',
      comments: '',
      overrides: [],
    },
  });

  const watchedAction = watch('action');

  React.useEffect(() => {
    if (open) {
      reset();
      setSelectedOverrides(new Set());
    }
  }, [open, reset]);

  const handleOverrideToggle = (violationId: string) => {
    const newOverrides = new Set(selectedOverrides);
    if (newOverrides.has(violationId)) {
      newOverrides.delete(violationId);
    } else {
      newOverrides.add(violationId);
    }
    setSelectedOverrides(newOverrides);
  };

  const onFormSubmit = (data: ReviewFormData) => {
    const overrides = Array.from(selectedOverrides).map(violationId => ({
      violationId,
      reason: data.overrides?.find(o => o.violationId === violationId)?.reason || '',
    }));

    onSubmit({
      action: data.action,
      comments: data.comments,
      overrides: overrides.length > 0 ? overrides : undefined,
    });
  };

  if (!approval) return null;

  const criticalViolations = approval.policyViolations.filter(v => v.severity === 'critical');
  const canApprove = criticalViolations.length === 0 || criticalViolations.every(v => selectedOverrides.has(v.id));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Review Approval Request - {approval.requestType.charAt(0).toUpperCase() + approval.requestType.slice(1)}
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Model Information
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Model ID: {approval.modelId}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Version ID: {approval.versionId}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Requested by: {approval.requestedBy}
          </Typography>
        </Box>

        {approval.policyViolations.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Policy Violations ({approval.policyViolations.length})
            </Typography>
            
            {criticalViolations.length > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                This request has {criticalViolations.length} critical violation(s) that must be overridden before approval.
              </Alert>
            )}

            <List>
              {approval.policyViolations.map((violation) => (
                <ListItem key={violation.id} divider>
                  <ListItemIcon>
                    {violation.severity === 'critical' ? (
                      <Error color="error" />
                    ) : (
                      <Warning color="warning" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body1">{violation.policyName}</Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            bgcolor: violation.severity === 'critical' ? 'error.light' : 'warning.light',
                            color: violation.severity === 'critical' ? 'error.contrastText' : 'warning.contrastText',
                          }}
                        >
                          {violation.severity.toUpperCase()}
                        </Typography>
                      </Box>
                    }
                    secondary={violation.message}
                  />
                  {violation.canOverride && (
                    <Checkbox
                      checked={selectedOverrides.has(violation.id)}
                      onChange={() => handleOverrideToggle(violation.id)}
                    />
                  )}
                </ListItem>
              ))}
            </List>

            {selectedOverrides.size > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Override Reasons
                </Typography>
                {Array.from(selectedOverrides).map((violationId) => {
                  const violation = approval.policyViolations.find(v => v.id === violationId);
                  return (
                    <Box key={violationId} sx={{ mb: 2 }}>
                      <Typography variant="body2" gutterBottom>
                        {violation?.policyName}
                      </Typography>
                      <Controller
                        name={`overrides.${Array.from(selectedOverrides).indexOf(violationId)}.reason` as any}
                        control={control}
                        defaultValue=""
                        render={({ field }) => (
                          <TextField
                            {...field}
                            fullWidth
                            size="small"
                            placeholder="Provide reason for override..."
                            error={!!errors.overrides?.[Array.from(selectedOverrides).indexOf(violationId)]?.reason}
                            helperText={errors.overrides?.[Array.from(selectedOverrides).indexOf(violationId)]?.reason?.message}
                          />
                        )}
                      />
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        )}

        <Divider sx={{ my: 3 }} />

        <Box component="form" onSubmit={handleSubmit(onFormSubmit)}>
          <FormControl component="fieldset" sx={{ mb: 3 }}>
            <FormLabel component="legend">Review Decision</FormLabel>
            <Controller
              name="action"
              control={control}
              render={({ field }) => (
                <RadioGroup {...field} row>
                  <FormControlLabel
                    value="approve"
                    control={<Radio />}
                    label="Approve"
                    disabled={!canApprove}
                  />
                  <FormControlLabel
                    value="request_changes"
                    control={<Radio />}
                    label="Request Changes"
                  />
                  <FormControlLabel
                    value="reject"
                    control={<Radio />}
                    label="Reject"
                  />
                </RadioGroup>
              )}
            />
          </FormControl>

          <Controller
            name="comments"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                multiline
                rows={4}
                label="Comments"
                placeholder={
                  watchedAction === 'approve'
                    ? 'Optional: Add any comments about the approval...'
                    : 'Provide detailed feedback about the issues...'
                }
                error={!!errors.comments}
                helperText={errors.comments?.message}
              />
            )}
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit(onFormSubmit)}
          variant="contained"
          disabled={isLoading || !canApprove && watchedAction === 'approve'}
        >
          Submit Review
        </Button>
      </DialogActions>
    </Dialog>
  );
};