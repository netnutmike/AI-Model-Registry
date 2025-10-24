import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  Box,
  Button,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
} from '@mui/material';
import {
  CheckCircle,
  Cancel,
  Warning,
  Error,
  Person,
  Schedule,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { ApprovalRequest } from '@/services/governance';
import { formatRelativeTime } from '@/utils';

interface ApprovalCardProps {
  approval: ApprovalRequest;
  onReview?: (id: string) => void;
}

const getStatusColor = (status: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'approved':
      return 'success';
    case 'rejected':
      return 'error';
    default:
      return 'default';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'pending':
      return <Schedule />;
    case 'approved':
      return <CheckCircle />;
    case 'rejected':
      return <Cancel />;
    default:
      return <Schedule />;
  }
};



const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'low':
      return <Warning color="info" />;
    case 'medium':
      return <Warning color="warning" />;
    case 'high':
      return <Error color="error" />;
    case 'critical':
      return <Error color="error" />;
    default:
      return <Warning />;
  }
};

export const ApprovalCard: React.FC<ApprovalCardProps> = ({ approval, onReview }) => {
  const navigate = useNavigate();

  const handleViewModel = () => {
    navigate(`/models/${approval.modelId}`);
  };

  const handleReview = () => {
    if (onReview) {
      onReview(approval.id);
    }
  };

  const criticalViolations = approval.policyViolations.filter(v => v.severity === 'critical').length;
  const highViolations = approval.policyViolations.filter(v => v.severity === 'high').length;

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
              {getStatusIcon(approval.status)}
            </Avatar>
            <Box>
              <Typography variant="h6" component="h3">
                {approval.requestType.charAt(0).toUpperCase() + approval.requestType.slice(1)} Approval
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Model ID: {approval.modelId}
              </Typography>
            </Box>
          </Box>
          <Chip
            label={approval.status}
            color={getStatusColor(approval.status)}
            icon={getStatusIcon(approval.status)}
          />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Person sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">
              Requested by {approval.requestedBy}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {formatRelativeTime(approval.requestedAt)}
          </Typography>
        </Box>

        {approval.policyViolations.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Policy Violations ({approval.policyViolations.length})
            </Typography>
            <Box sx={{ mb: 2 }}>
              {criticalViolations > 0 && (
                <Chip
                  label={`${criticalViolations} Critical`}
                  color="error"
                  size="small"
                  sx={{ mr: 1, mb: 1 }}
                />
              )}
              {highViolations > 0 && (
                <Chip
                  label={`${highViolations} High`}
                  color="error"
                  size="small"
                  sx={{ mr: 1, mb: 1 }}
                />
              )}
            </Box>
            <List dense>
              {approval.policyViolations.slice(0, 3).map((violation) => (
                <ListItem key={violation.id} sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {getSeverityIcon(violation.severity)}
                  </ListItemIcon>
                  <ListItemText
                    primary={violation.policyName}
                    secondary={violation.message}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              ))}
              {approval.policyViolations.length > 3 && (
                <ListItem sx={{ px: 0 }}>
                  <ListItemText
                    primary={`+${approval.policyViolations.length - 3} more violations`}
                    primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                  />
                </ListItem>
              )}
            </List>
          </>
        )}

        {approval.evaluationResults.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Evaluations ({approval.evaluationResults.length})
            </Typography>
            <Box>
              {approval.evaluationResults.map((evaluation) => (
                <Chip
                  key={evaluation.id}
                  label={evaluation.passed ? 'Passed' : 'Failed'}
                  color={evaluation.passed ? 'success' : 'error'}
                  size="small"
                  sx={{ mr: 1, mb: 1 }}
                />
              ))}
            </Box>
          </>
        )}

        {approval.comments && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Comments
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {approval.comments}
            </Typography>
          </>
        )}
      </CardContent>

      <CardActions>
        <Button size="small" onClick={handleViewModel}>
          View Model
        </Button>
        {approval.status === 'pending' && onReview && (
          <Button size="small" variant="contained" onClick={handleReview}>
            Review
          </Button>
        )}
      </CardActions>
    </Card>
  );
};