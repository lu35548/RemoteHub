import React, { useState, useEffect } from 'react';
import { getStorage } from '../services/storage.adapter';
import { migrationService } from '../services/migration.service';

interface StorageModeToggleProps {
  onModeChange?: (mode: 'local' | 'api') => void;
  showAdvanced?: boolean;
}

export const StorageModeToggle: React.FC<StorageModeToggleProps> = ({
  onModeChange,
  showAdvanced = false
}) => {
  const [currentMode, setCurrentMode] = useState<'local' | 'api'>('local');
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);

  useEffect(() => {
    checkCurrentMode();
    if (showAdvanced) {
      checkSyncStatus();
    }
  }, [showAdvanced]);

  const checkCurrentMode = () => {
    const isApiMode = import.meta.env.VITE_USE_API === 'true';
    setCurrentMode(isApiMode ? 'api' : 'local');
  };

  const checkSyncStatus = async () => {
    try {
      const status = await migrationService.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('获取同步状态失败:', error);
    }
  };

  const handleModeToggle = async (newMode: 'local' | 'api') => {
    if (newMode === currentMode) return;

    setIsLoading(true);

    try {
      if (newMode === 'api') {
        // 切换到API模式前检查API可用性
        const storage = await getStorage();
        const healthCheck = await (storage as any).healthCheck();

        if (!healthCheck) {
          alert('API服务不可用，请确保后端服务正在运行');
          setIsLoading(false);
          return;
        }

        // 显示迁移确认对话框
        setShowMigrationDialog(true);
      } else {
        // 切换到localStorage模式
        localStorage.setItem('VITE_USE_API', 'false');
        setCurrentMode('local');
        onModeChange?.('local');
      }
    } catch (error) {
      console.error('模式切换失败:', error);
      alert('模式切换失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleMigrationConfirm = async () => {
    setShowMigrationDialog(false);

    try {
      await migrationService.startMigration();

      // 切换到API模式
      localStorage.setItem('VITE_USE_API', 'true');
      setCurrentMode('api');
      onModeChange?.('api');

      // 更新同步状态
      await checkSyncStatus();

      alert('迁移完成！已切换到API模式');
    } catch (error) {
      console.error('迁移失败:', error);
      alert('迁移失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const handleIncrementalSync = async () => {
    setIsLoading(true);

    try {
      await migrationService.performIncrementalSync();
      await checkSyncStatus();
      alert('增量同步完成！');
    } catch (error) {
      console.error('增量同步失败:', error);
      alert('增量同步失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="storage-mode-toggle">
      <div className="mode-switch">
        <label className="switch-label">
          <span className={`mode-label ${currentMode === 'local' ? 'active' : ''}`}>
            📱 LocalStorage
          </span>
          <div className="switch">
            <input
              type="checkbox"
              checked={currentMode === 'api'}
              onChange={(e) => handleModeToggle(e.target.checked ? 'api' : 'local')}
              disabled={isLoading}
            />
            <span className="slider"></span>
          </div>
          <span className={`mode-label ${currentMode === 'api' ? 'active' : ''}`}>
            🌐 API Mode
          </span>
        </label>
        {isLoading && <span className="loading-indicator">⏳</span>}
      </div>

      {showAdvanced && syncStatus && (
        <div className="sync-status">
          <div className="status-indicators">
            <div className={`indicator ${syncStatus.localStorage ? 'ok' : 'error'}`}>
              <span className="icon">📱</span>
              <span className="text">LocalStorage</span>
            </div>
            <div className={`indicator ${syncStatus.api ? 'ok' : 'error'}`}>
              <span className="icon">🌐</span>
              <span className="text">API</span>
            </div>
          </div>

          <div className="sync-details">
            <div className="sync-stats">
              <span>总计: {syncStatus.totalRecords}</span>
              <span>已同步: {syncStatus.syncedRecords}</span>
              <span>冲突: {syncStatus.conflicts.length}</span>
            </div>

            {currentMode === 'api' && (
              <div className="sync-actions">
                <button
                  onClick={handleIncrementalSync}
                  className="sync-button"
                  disabled={isLoading}
                >
                  🔄 增量同步
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showMigrationDialog && (
        <div className="migration-dialog-overlay">
          <div className="migration-dialog">
            <h3>🔄 切换到API模式</h3>
            <p>
              切换到API模式需要将现有数据从localStorage迁移到后端API。
              这个过程会：
            </p>
            <ul>
              <li>备份您的现有数据</li>
              <li>验证数据格式</li>
              <li>将数据同步到API</li>
              <li>切换到API模式</li>
            </ul>
            <p className="warning">
              ⚠️ 请确保后端服务正在运行并且可以访问
            </p>
            <div className="dialog-actions">
              <button
                onClick={() => setShowMigrationDialog(false)}
                className="cancel-button"
              >
                取消
              </button>
              <button
                onClick={handleMigrationConfirm}
                className="confirm-button"
                disabled={isLoading}
              >
                {isLoading ? '⏳ 迁移中...' : '确认迁移'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .storage-mode-toggle {
          padding: 16px;
          background: #f8f9fa;
          border-radius: 8px;
          margin: 16px 0;
        }

        .mode-switch {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .switch-label {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
          font-weight: 500;
        }

        .mode-label {
          opacity: 0.6;
          transition: opacity 0.3s ease;
        }

        .mode-label.active {
          opacity: 1;
        }

        .switch {
          position: relative;
          width: 60px;
          height: 30px;
        }

        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: 0.4s;
          border-radius: 30px;
        }

        .slider:before {
          position: absolute;
          content: "";
          height: 22px;
          width: 22px;
          left: 4px;
          bottom: 4px;
          background-color: white;
          transition: 0.4s;
          border-radius: 50%;
        }

        input:checked + .slider {
          background-color: #2196F3;
        }

        input:checked + .slider:before {
          transform: translateX(30px);
        }

        .loading-indicator {
          animation: pulse 1.5s ease-in-out infinite alternate;
        }

        @keyframes pulse {
          from { opacity: 1; }
          to { opacity: 0.4; }
        }

        .sync-status {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #e0e0e0;
        }

        .status-indicators {
          display: flex;
          gap: 16px;
          margin-bottom: 12px;
        }

        .indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .indicator.ok {
          background: #e8f5e8;
          color: #2e7d32;
        }

        .indicator.error {
          background: #ffebee;
          color: #c62828;
        }

        .sync-details {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .sync-stats {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: #666;
        }

        .sync-actions {
          display: flex;
          gap: 8px;
        }

        .sync-button {
          padding: 6px 12px;
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: background-color 0.3s ease;
        }

        .sync-button:hover:not(:disabled) {
          background: #1976D2;
        }

        .sync-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .migration-dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .migration-dialog {
          background: white;
          padding: 24px;
          border-radius: 8px;
          max-width: 400px;
          width: 90%;
        }

        .migration-dialog h3 {
          margin: 0 0 16px 0;
          color: #333;
        }

        .migration-dialog p {
          margin: 0 0 12px 0;
          color: #666;
        }

        .migration-dialog ul {
          margin: 12px 0;
          padding-left: 20px;
        }

        .migration-dialog li {
          margin: 4px 0;
          color: #666;
        }

        .warning {
          color: #f44336;
          font-weight: 500;
        }

        .dialog-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 20px;
        }

        .dialog-actions button {
          padding: 8px 16px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          transition: background-color 0.3s ease;
        }

        .cancel-button:hover {
          background: #f5f5f5;
        }

        .confirm-button {
          background: #2196F3;
          color: white;
          border-color: #2196F3;
        }

        .confirm-button:hover:not(:disabled) {
          background: #1976D2;
        }

        .confirm-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};