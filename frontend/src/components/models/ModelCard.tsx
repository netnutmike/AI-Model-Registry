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
  Tooltip,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Model } from '@/types';
import { formatRelativeTime, getRiskTierColor, truncateText } from '@/utils';
import { Storage, Person } from '@mui/icons-material';

interface ModelCardProps {
  model: Model;
}

export const ModelCard: React.FC<ModelCardProps> = ({ model }) => {
  const navigate = useNavigate();

  const handleViewDetails = () => {
    navigate(`/models/${model.id}`);
  };

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
            <Storage />
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" component="h2" noWrap>
              {model.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {model.group}
            </Typography>
          </Box>
          <Chip
            label={model.riskTier}
            color={getRiskTierColor(model.riskTier)}
            size="small"
          />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {truncateText(model.description, 120)}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Person sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary">
            {model.owners.length > 1 
              ? `${model.owners[0]} +${model.owners.length - 1} others`
              : model.owners[0]
            }
          </Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          {model.tags.slice(0, 3).map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              variant="outlined"
              sx={{ mr: 0.5, mb: 0.5 }}
            />
          ))}
          {model.tags.length > 3 && (
            <Tooltip title={model.tags.slice(3).join(', ')}>
              <Chip
                label={`+${model.tags.length - 3} more`}
                size="small"
                variant="outlined"
                sx={{ mr: 0.5, mb: 0.5 }}
              />
            </Tooltip>
          )}
        </Box>

        <Typography variant="caption" color="text.secondary">
          Updated {formatRelativeTime(model.updatedAt)}
        </Typography>
      </CardContent>

      <CardActions>
        <Button size="small" onClick={handleViewDetails}>
          View Details
        </Button>
      </CardActions>
    </Card>
  );
};