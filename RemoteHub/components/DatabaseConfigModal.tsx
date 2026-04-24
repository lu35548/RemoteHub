// Database Configuration Modal
// Admin-only interface for configuring database connections

import React, { useState, useEffect } from 'react';
import { config } from '../services/config.service';
import { apiStorage, ApiError } from '../services/api.adapter';
import { LoadingButton, LoadingSpinner } from './LoadingStates';

interface DatabaseConfig {
  id: string;
  name: string;
  type: 'mysql' | 'sqlserver';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  isActive: boolean;
  connectionOptions?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    connectionTimeout?: number;
    requestTimeout?: number;
  };
}

interface DatabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DatabaseConfigModal: React.FC<DatabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [configs, setConfigs] = useState<DatabaseConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<Partial<DatabaseConfig> | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

  useEffect(() => {
    if (isOpen) {
      loadConfigs();
    }
  }, [isOpen]);

  const loadConfigs = async () => {
    setLoading(true);
    setError(null);

    try {
      // This would call the backend API when implemented
      // For now, we'll use mock data
      const mockConfigs: DatabaseConfig[] = [
        {
          id: '1',
          name: 'Development Database',
          type: 'mysql',
          host: 'localhost',
          port: 3306,
          database: 'remotehub_dev',
          username: 'root',
          password: '',
          isActive: true,
          connectionOptions: {
            connectionTimeout: 30000
          }
        }
      ];
      setConfigs(mockConfigs);
    } catch (error) {
      setError('Failed to load database configurations');
      console.error('Error loading configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async (config: DatabaseConfig) => {
    setTesting(config.id);
    setError(null);

    try {
      // This would call the backend API to test the connection
      // For now, we'll simulate the test
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulate success/failure
      if (config.host === 'invalid-host') {
        throw new Error('Connection failed: Host not found');
      }

      alert(`Connection to ${config.name} successful!`);
    } catch (error) {
      setError(`Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTesting(null);
    }
  };

  const saveConfig = async () => {
    if (!editingConfig) return;

    setLoading(true);
    setError(null);

    try {
      // Validate required fields
      if (!editingConfig.name || !editingConfig.host || !editingConfig.database || !editingConfig.username) {
        throw new Error('Please fill in all required fields');
      }

      // This would call the backend API to save the configuration
      const newConfig: DatabaseConfig = {
        id: editingConfig.id || Date.now().toString(),
        name: editingConfig.name!,
        type: editingConfig.type || 'mysql',
        host: editingConfig.host!,
        port: editingConfig.port || (editingConfig.type === 'mysql' ? 3306 : 1433),
        database: editingConfig.database!,
        username: editingConfig.username!,
        password: editingConfig.password || '',
        isActive: editingConfig.isActive || false,
        connectionOptions: editingConfig.connectionOptions
      };

      if (editingConfig.id) {
        // Update existing config
        setConfigs(prev => prev.map(c => c.id === editingConfig.id ? newConfig : c));
      } else {
        // Create new config
        setConfigs(prev => [...prev, newConfig]);
      }

      setEditingConfig(null);
      setActiveTab('list');
      onSuccess?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const deleteConfig = async (configId: string) => {
    if (!confirm('Are you sure you want to delete this database configuration?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // This would call the backend API to delete the configuration
      setConfigs(prev => prev.filter(c => c.id !== configId));
    } catch (error) {
      setError('Failed to delete configuration');
    } finally {
      setLoading(false);
    }
  };

  const setActiveConfig = async (configId: string) => {
    setLoading(true);
    setError(null);

    try {
      // This would call the backend API to set the active configuration
      setConfigs(prev => prev.map(c => ({
        ...c,
        isActive: c.id === configId
      })));

      onSuccess?.();
      alert('Database configuration updated successfully!');
    } catch (error) {
      setError('Failed to set active configuration');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Database Configuration</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex space-x-4 mt-4">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeTab === 'list'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Configurations
            </button>
            <button
              onClick={() => {
                setActiveTab('create');
                setEditingConfig({
                  type: 'mysql',
                  port: 3306,
                  isActive: false,
                  connectionOptions: {
                    connectionTimeout: 30000,
                    encrypt: false,
                    trustServerCertificate: true
                  }
                });
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeTab === 'create'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Add New
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <div className="p-6">
          {activeTab === 'list' && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : configs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No database configurations found</p>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    Add your first configuration
                  </button>
                </div>
              ) : (
                configs.map((config) => (
                  <div
                    key={config.id}
                    className={`border rounded-lg p-4 ${
                      config.isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-medium text-gray-900">{config.name}</h3>
                          {config.isActive && (
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {config.type.toUpperCase()} • {config.host}:{config.port} • {config.database}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          User: {config.username}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <LoadingButton
                          loading={testing === config.id}
                          onClick={() => testConnection(config)}
                          className="px-3 py-1 text-sm"
                          loadingText="Testing..."
                        >
                          Test
                        </LoadingButton>

                        {!config.isActive && (
                          <LoadingButton
                            loading={loading}
                            onClick={() => setActiveConfig(config.id)}
                            className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700"
                          >
                            Set Active
                          </LoadingButton>
                        )}

                        <button
                          onClick={() => setEditingConfig(config)}
                          className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => deleteConfig(config.id)}
                          className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-md"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'create' && editingConfig && (
            <DatabaseConfigForm
              config={editingConfig}
              onChange={setEditingConfig}
              onSave={saveConfig}
              onCancel={() => {
                setEditingConfig(null);
                setActiveTab('list');
              }}
              loading={loading}
            />
          )}
        </div>
      </div>
    </div>
  );
};

interface DatabaseConfigFormProps {
  config: Partial<DatabaseConfig>;
  onChange: (config: Partial<DatabaseConfig>) => void;
  onSave: () => void;
  onCancel: () => void;
  loading: boolean;
}

const DatabaseConfigForm: React.FC<DatabaseConfigFormProps> = ({
  config,
  onChange,
  onSave,
  onCancel,
  loading
}) => {
  const [showPassword, setShowPassword] = useState(false);

  const updateField = (field: keyof DatabaseConfig, value: any) => {
    onChange({ ...config, [field]: value });
  };

  const updateConnectionOption = (field: string, value: any) => {
    onChange({
      ...config,
      connectionOptions: {
        ...config.connectionOptions,
        [field]: value
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Configuration Name *
          </label>
          <input
            type="text"
            value={config.name || ''}
            onChange={(e) => updateField('name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Production Database"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Database Type *
          </label>
          <select
            value={config.type || 'mysql'}
            onChange={(e) => updateField('type', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="mysql">MySQL</option>
            <option value="sqlserver">SQL Server</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Host *
          </label>
          <input
            type="text"
            value={config.host || ''}
            onChange={(e) => updateField('host', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="localhost or IP address"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Port *
          </label>
          <input
            type="number"
            value={config.port || (config.type === 'mysql' ? 3306 : 1433)}
            onChange={(e) => updateField('port', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Database Name *
        </label>
        <input
          type="text"
          value={config.database || ''}
          onChange={(e) => updateField('database', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="database_name"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Username *
          </label>
          <input
            type="text"
            value={config.username || ''}
            onChange={(e) => updateField('username', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={config.password || ''}
              onChange={(e) => updateField('password', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      </div>

      {/* Connection Options */}
      <div className="border-t pt-4">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Connection Options</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Connection Timeout (ms)
            </label>
            <input
              type="number"
              value={config.connectionOptions?.connectionTimeout || 30000}
              onChange={(e) => updateConnectionOption('connectionTimeout', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {config.type === 'sqlserver' && (
            <>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="encrypt"
                  checked={config.connectionOptions?.encrypt || false}
                  onChange={(e) => updateConnectionOption('encrypt', e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="encrypt" className="text-sm text-gray-700">
                  Encrypt Connection
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="trustCert"
                  checked={config.connectionOptions?.trustServerCertificate || false}
                  onChange={(e) => updateConnectionOption('trustServerCertificate', e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="trustCert" className="text-sm text-gray-700">
                  Trust Server Certificate
                </label>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t">
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <LoadingButton
          loading={loading}
          onClick={onSave}
          loadingText="Saving..."
        >
          Save Configuration
        </LoadingButton>
      </div>
    </div>
  );
};