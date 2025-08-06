# Binance History Service - Frontend

Modern React frontend for managing historical cryptocurrency data from Binance with real-time WebSocket updates.

## Features

- 📊 **Symbol Management**: View and manage all Binance symbols with loading status
- ⏬ **Download Historical Data**: Create download jobs with date range selection
- 📈 **Real-time Progress**: Live WebSocket updates for download progress
- 🔑 **API Token Management**: Create and manage API tokens
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🎨 **Modern UI**: Built with Ant Design components

## Tech Stack

- **React 18** - Modern React with hooks
- **TypeScript** - Type-safe development
- **Ant Design 5** - UI component library
- **React Hook Form** - Form validation with Yup
- **Socket.IO Client** - Real-time WebSocket communication
- **Axios** - HTTP client for API calls
- **Day.js** - Date manipulation

## Prerequisites

- Node.js 16+ 
- npm or yarn
- Running backend service (see backend README)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd frontend
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Create environment file:
```bash
cp .env.example .env.local
```

4. Configure environment variables:
```bash
# .env.local
REACT_APP_API_URL=http://localhost:3001
REACT_APP_WS_URL=http://localhost:3001
```

## Development

Start the development server:
```bash
npm start
# or
yarn start
```

The application will be available at `http://localhost:3000`

## Building for Production

```bash
npm run build
# or
yarn build
```

The build artifacts will be stored in the `build/` directory.

## Project Structure

```
src/
├── components/           # React components
│   ├── SymbolsList.tsx  # Main symbols table
│   ├── DownloadModal.tsx # Download job modal
│   └── TokenManagement.tsx # API token management
├── hooks/               # Custom React hooks
│   └── useWebSocket.ts  # WebSocket connection hook
├── services/           # API services
│   └── api.ts          # API client
├── types/              # TypeScript type definitions
│   └── index.ts        # Shared types
├── App.tsx             # Main application component
├── App.css             # Application styles
└── index.tsx           # Application entry point
```

## Key Components

### SymbolsList
Main component displaying all symbols with their timeframe data:
- Search and filter symbols
- View data ranges for each timeframe
- Download buttons for loading historical data
- Real-time progress tracking
- Cancel running jobs

### DownloadModal
Modal for creating download jobs:
- Date range picker with presets
- Validation for date ranges
- Estimation of candles and data size
- Form validation with Yup

### TokenManagement
API token management interface:
- Create new API tokens
- View token usage statistics
- Revoke tokens
- Copy tokens to clipboard

## WebSocket Integration

The application uses WebSocket for real-time updates:
- Job progress updates
- Job status changes (started, completed, failed)
- Statistics updates
- System notifications

```typescript
const { isConnected, connectionError } = useWebSocket({
  onJobUpdate: (data) => {
    // Handle job progress updates
  },
  onJobCompleted: (data) => {
    // Handle job completion
  }
});
```

## API Integration

All API calls are handled through service classes:

```typescript
// Symbols API
import { symbolsApi } from './services/api';
const symbols = await symbolsApi.getSymbolsWithLoadingStatus();

// Queue API  
import { queueApi } from './services/api';
const job = await queueApi.createDownloadJob(jobData);

// Auth API
import { authApi } from './services/api';
const token = await authApi.createToken(tokenData);
```

## Form Validation

Forms use React Hook Form with Yup validation:

```typescript
const schema = yup.object().shape({
  name: yup.string().required('Name is required'),
  dateRange: yup.array().length(2, 'Select date range')
});

const { control, handleSubmit, formState: { errors } } = useForm({
  resolver: yupResolver(schema)
});
```

## Available Scripts

- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_API_URL` | Backend API URL | `http://localhost:3001` |
| `REACT_APP_WS_URL` | WebSocket URL | `http://localhost:3001` |
| `REACT_APP_DEBUG` | Enable debug mode | `false` |

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Contributing

1. Create feature branch from `main`
2. Make changes with proper TypeScript types
3. Add/update tests as needed
4. Ensure all linting passes
5. Submit pull request

## Common Issues

### WebSocket Connection Failed
- Check if backend is running
- Verify CORS settings
- Check firewall/proxy settings

### API Token Required
- Create an API token in the Token Management tab
- Token is stored in localStorage
- Backend requires valid token for all requests

### Build Errors
- Clear node_modules and reinstall
- Check TypeScript errors
- Verify all imports are correct

## Performance

- Components use React.memo for optimization
- WebSocket reconnection with exponential backoff
- Lazy loading for large symbol lists
- Debounced search inputs

## Security

- API tokens stored securely in localStorage
- All API calls include authentication headers
- Input validation on all forms
- XSS protection with proper escaping