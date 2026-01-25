import { createTheme } from '@mui/material/styles'

// Create a custom MaterialUI theme for the application
export const theme = createTheme({
  palette: {
    primary: {
      main: '#3b82f6', // Blue color matching the existing design
    },
    secondary: {
      main: '#10b981', // Green color for success actions
    },
    success: {
      main: '#10b981', // Green for success states
    },
    error: {
      main: '#ef4444', // Red for error states
    },
    warning: {
      main: '#f59e0b', // Yellow for warning states
    },
    info: {
      main: '#06b6d4', // Cyan for info states
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
  },
  shape: {
    borderRadius: 8, // Consistent border radius
  },
  components: {
    // Customize MaterialUI components to match the application design
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', // Disable uppercase transformation
          fontWeight: 500,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow:
            '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '0.875rem',
        },
      },
    },
  },
})
