import React, { useState, useCallback } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  OutlinedInput,
  Button,
  Paper,
  Typography,
  Collapse,
} from '@mui/material';
import { Search, FilterList, ExpandMore, ExpandLess, Clear } from '@mui/icons-material';
import { SearchFilters, VersionState } from '@/types';
import { useModelTags, useModelGroups } from '@/hooks/useModels';
import { debounce } from '@/utils';

interface ModelSearchProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
}

export const ModelSearch: React.FC<ModelSearchProps> = ({ filters, onFiltersChange }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { data: availableTags = [] } = useModelTags();
  const { data: availableGroups = [] } = useModelGroups();

  const debouncedSearch = useCallback(
    debounce((value: string) => {
      onFiltersChange({ ...filters, search: value });
    }, 300),
    [filters, onFiltersChange]
  );

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    debouncedSearch(event.target.value);
  };

  const handleGroupChange = (event: any) => {
    onFiltersChange({ ...filters, group: event.target.value });
  };

  const handleRiskTierChange = (event: any) => {
    onFiltersChange({ ...filters, riskTier: event.target.value });
  };

  const handleStateChange = (event: any) => {
    onFiltersChange({ ...filters, state: event.target.value });
  };

  const handleTagsChange = (event: any) => {
    onFiltersChange({ ...filters, tags: event.target.value });
  };

  const handleOwnerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, owner: event.target.value });
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = Object.keys(filters).some(key => 
    filters[key as keyof SearchFilters] !== undefined && 
    filters[key as keyof SearchFilters] !== '' &&
    !(Array.isArray(filters[key as keyof SearchFilters]) && (filters[key as keyof SearchFilters] as any[]).length === 0)
  );

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <TextField
          fullWidth
          placeholder="Search models..."
          defaultValue={filters.search || ''}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: <Search sx={{ color: 'text.secondary', mr: 1 }} />,
          }}
        />
        <Button
          variant="outlined"
          startIcon={showAdvanced ? <ExpandLess /> : <ExpandMore />}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <FilterList sx={{ mr: 1 }} />
          Filters
        </Button>
        {hasActiveFilters && (
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<Clear />}
            onClick={clearFilters}
          >
            Clear
          </Button>
        )}
      </Box>

      <Collapse in={showAdvanced}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
          <FormControl size="small">
            <InputLabel>Group</InputLabel>
            <Select
              value={filters.group || ''}
              onChange={handleGroupChange}
              label="Group"
            >
              <MenuItem value="">All Groups</MenuItem>
              {(availableGroups || []).map((group: string) => (
                <MenuItem key={group} value={group}>
                  {group}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small">
            <InputLabel>Risk Tier</InputLabel>
            <Select
              value={filters.riskTier || ''}
              onChange={handleRiskTierChange}
              label="Risk Tier"
            >
              <MenuItem value="">All Risk Tiers</MenuItem>
              <MenuItem value="Low">Low</MenuItem>
              <MenuItem value="Medium">Medium</MenuItem>
              <MenuItem value="High">High</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small">
            <InputLabel>State</InputLabel>
            <Select
              value={filters.state || ''}
              onChange={handleStateChange}
              label="State"
            >
              <MenuItem value="">All States</MenuItem>
              {Object.values(VersionState).map((state) => (
                <MenuItem key={state} value={state}>
                  {state.replace('_', ' ').toUpperCase()}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small">
            <InputLabel>Tags</InputLabel>
            <Select
              multiple
              value={filters.tags || []}
              onChange={handleTagsChange}
              input={<OutlinedInput label="Tags" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {(selected as string[]).map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
            >
              {(availableTags || []).map((tag: string) => (
                <MenuItem key={tag} value={tag}>
                  {tag}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Owner"
            value={filters.owner || ''}
            onChange={handleOwnerChange}
            placeholder="Filter by owner..."
          />
        </Box>
      </Collapse>

      {hasActiveFilters && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Active filters:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {filters.search && (
              <Chip
                label={`Search: "${filters.search}"`}
                onDelete={() => onFiltersChange({ ...filters, search: undefined })}
                size="small"
              />
            )}
            {filters.group && (
              <Chip
                label={`Group: ${filters.group}`}
                onDelete={() => onFiltersChange({ ...filters, group: undefined })}
                size="small"
              />
            )}
            {filters.riskTier && (
              <Chip
                label={`Risk: ${filters.riskTier}`}
                onDelete={() => onFiltersChange({ ...filters, riskTier: undefined })}
                size="small"
              />
            )}
            {filters.state && (
              <Chip
                label={`State: ${filters.state}`}
                onDelete={() => onFiltersChange({ ...filters, state: undefined })}
                size="small"
              />
            )}
            {filters.owner && (
              <Chip
                label={`Owner: ${filters.owner}`}
                onDelete={() => onFiltersChange({ ...filters, owner: undefined })}
                size="small"
              />
            )}
            {filters.tags && filters.tags.length > 0 && (
              <Chip
                label={`Tags: ${filters.tags.join(', ')}`}
                onDelete={() => onFiltersChange({ ...filters, tags: undefined })}
                size="small"
              />
            )}
          </Box>
        </Box>
      )}
    </Paper>
  );
};