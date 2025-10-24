import React, { useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Pagination,
  CircularProgress,
  Alert,
  Button,
  Fab,
} from '@mui/material';
import { Add } from '@mui/icons-material';
import { useModels } from '@/hooks/useModels';
import { ModelCard } from '@/components/models/ModelCard';
import { ModelSearch } from '@/components/models/ModelSearch';
import { SearchFilters } from '@/types';

export const ModelCatalog: React.FC = () => {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SearchFilters>({});
  const limit = 12;

  const { data, isLoading, error } = useModels(filters, page, limit);

  const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
  };

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  };

  if (error) {
    return (
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          Model Catalog
        </Typography>
        <Alert severity="error">
          Failed to load models. Please try again later.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Model Catalog
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => {
            // TODO: Navigate to model creation page
            console.log('Navigate to model creation');
          }}
        >
          Register Model
        </Button>
      </Box>

      <ModelSearch filters={filters} onFiltersChange={handleFiltersChange} />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {data?.data && data.data.length > 0 ? (
            <>
              <Grid container spacing={3}>
                {data.data.map((model) => (
                  <Grid item xs={12} sm={6} md={4} key={model.id}>
                    <ModelCard model={model} />
                  </Grid>
                ))}
              </Grid>

              {data.pagination.totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                  <Pagination
                    count={data.pagination.totalPages}
                    page={page}
                    onChange={handlePageChange}
                    color="primary"
                    size="large"
                  />
                </Box>
              )}

              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Showing {data.data.length} of {data.pagination.total} models
                </Typography>
              </Box>
            </>
          ) : (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No models found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {Object.keys(filters).length > 0
                  ? 'Try adjusting your search filters or register a new model.'
                  : 'Get started by registering your first model.'}
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => {
                  // TODO: Navigate to model creation page
                  console.log('Navigate to model creation');
                }}
              >
                Register Model
              </Button>
            </Box>
          )}
        </>
      )}

      {/* Floating Action Button for mobile */}
      <Fab
        color="primary"
        aria-label="add model"
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          display: { xs: 'flex', sm: 'none' },
        }}
        onClick={() => {
          // TODO: Navigate to model creation page
          console.log('Navigate to model creation');
        }}
      >
        <Add />
      </Fab>
    </Box>
  );
};