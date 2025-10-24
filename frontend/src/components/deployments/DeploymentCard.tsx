import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  Box,
  Button,
  LinearProgress,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  CloudUpload,
  MoreVert,
  Visibility,
  Stop,
  Refresh,
  Delete,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { Deployment } from '@/types';
import { formatRelativeTime } from '@/utils';

interface DeploymentCardProps {
  deployment: Deployment;
  onView?: (id: string) => void;
  onStop?: (id: string) => void;
  onRollback?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const getStatusColor = (status: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (status) {
    case 'active':
      return 'success';
    case 'deploying':
      return 'info';
    case 'pending':
      return 'warning';
    case 'failed':
      return 'error';
    case 'rolled_back':
      return 'warning';
    default:
      return 'default';
  }
};

const getEnvironmentColor = (environment: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (environment) {
    case 'production':
      return 'error';
    case 'staging':
      return 'warning';
    default:
      return 'default';
  }
};

export const DeploymentCard: React.FC<DeploymentCardProps> = ({
  deployment,
  onView,
  onStop,
  onRollback,
  onDelete,
}) => {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleView = () => {
    if (onView) {
      onView(deployment.id);
    } else {
      navigate(`/deployments/${deployment.id}`);
    }
    handleMenuClose();
  };

  const handleStop = () => {
    onStop?.(deployment.id);
    handleMenuClose();
  };

  const handleRollback = () => {
    onRollback?.(deployment.id);
    handleMenuClose();
  };

  const handleDelete = () => {
    onDelete?.(deployment.id);
    handleMenuClose();
  };

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
              <CloudUpload />
            </Avatar>
            <Box>
              <Typography variant="h6" component="h3" noWrap>
                {deployment.versionId}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {deployment.environment}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={deployment.environment}
              color={getEnvironmentColor(deployment.environment)}
              size="small"
            />
            <IconButton size="small" onClick={handleMenuOpen}>
              <MoreVert />
            </IconButton>
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Chip
              label={deployment.status}
              color={getStatusColor(deployment.status)}
              size="small"
            />
            <Typography variant="body2" color="text.secondary">
              {deployment.trafficPercentage}% traffic
            </Typography>
          </Box>
          
          {deployment.status === 'deploying' && (
            <LinearProgress sx={{ mt: 1 }} />
          )}
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Created: {formatRelativeTime(deployment.createdAt)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Updated: {formatRelativeTime(deployment.updatedAt)}
          </Typography>
        </Box>

        {/* Traffic percentage bar */}
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Traffic Distribution
          </Typography>
          <LinearProgress
            variant="determinate"
            value={deployment.trafficPercentage}
            sx={{ mt: 0.5, height: 8, borderRadius: 4 }}
          />
        </Box>
      </CardContent>

      <CardActions>
        <Button size="small" onClick={handleView}>
          View Details
        </Button>
      </CardActions>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleView}>
          <Visibility sx={{ mr: 1 }} />
          View Details
        </MenuItem>
        {deployment.status === 'active' && (
          <MenuItem onClick={handleStop}>
            <Stop sx={{ mr: 1 }} />
            Stop Deployment
          </MenuItem>
        )}
        {deployment.status === 'active' && (
          <MenuItem onClick={handleRollback}>
            <Refresh sx={{ mr: 1 }} />
            Rollback
          </MenuItem>
        )}
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <Delete sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>
    </Card>
  );
};