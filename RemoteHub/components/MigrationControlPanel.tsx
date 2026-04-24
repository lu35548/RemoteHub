/**
 * 迁移控制面板
 * 提供完整的迁移管理和监控功能
 */

import React, { useState, useEffect } from 'react';
import { progressiveMigrationManager, type MigrationConfig, type MigrationReport, type MigrationPhase } from '../services/progressiveMigrationManager';
import { migrationService } from '../services/migration.service';

interface MigrationControlPanelProps {
  onMigrationComplete?: (report: MigrationReport) => void;
  onMigrationError?: (error: Error) => void;
  showAdvanced?: boolean;
}

export const MigrationControlPanel: React.FC<MigrationControlPanelProps> = ({
  onMigrationComplete,
  onMigrationError,
  showAdvanced = false
}) => {
  const [isMigrating, setIsMigrating] = useState(false);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [phases, setPhases] = useState<MigrationPhase[]>([]);
  const [config, setConfig] = useState<MigrationConfig>({
    enableAutoBackup: true,
    enableValidation: true,
    enableRollback: true,
    batchSize: 50,
    retryAttempts: 3,
    delayBetweenPhases: 1000
  });
  const [history, setHistory] = useState<MigrationReport[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    loadMigrationStatus();
    loadMigrationHistory();
    loadSyncStatus();

    // 定期刷新状态
    const interval = setInterval(() => {
      if (isMigrating) {
        loadMigrationStatus();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isMigrating]);

  const loadMigrationStatus = () => {
    try {
      const status = progressiveMigrationManager.getCurrentStatus();
      setCurrentSession(status.sessionId);
      setPhases(status.phases);
      setIsMigrating(status.isRunning);
    } catch (error) {
      console.error('加载迁移状态失败:', error);
    }
  };

  const loadMigrationHistory = () => {
    try {
      const reports = progressiveMigrationManager.getMigrationHistory();
      setHistory(reports);
    } catch (error) {
      console.error('加载迁移历史失败:', error);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const status = await migrationService.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('加载同步状态失败:', error);
    }
  };

  const startMigration = async () => {
    if (isMigrating) {
      alert('迁移正在进行中，请等待完成');
      return;
    }

    try {
      // 配置迁移管理器
      progressiveMigrationManager.configure(config);

      setIsMigrating(true);
      setCurrentSession(null);
      setPhases([]);

      const sessionId = await progressiveMigrationManager.startMigration();
      setCurrentSession(sessionId);

      // 生成迁移报告
      const report = await progressiveMigrationManager.generateReport();

      setIsMigrating(false);
      onMigrationComplete?.(report);
      loadMigrationHistory();

      alert(`✅ 迁移完成！成功迁移 ${report.summary.migratedRecords} 条记录`);

    } catch (error) {
      setIsMigrating(false);
      const migrationError = error instanceof Error ? error : new Error('迁移失败');
      onMigrationError?.(migrationError);
      alert(`❌ 迁移失败: ${migrationError.message}`);
    }
  };

  const handleConfigChange = (key: keyof MigrationConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const getPhaseIcon = (status: MigrationPhase['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'in_progress': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'rolled_back': return '🔙';
      default: return '❓';
    }
  };

  const getStatusColor = (status: MigrationPhase['status']) => {
    switch (status) {
      case 'pending': return '#666';
      case 'in_progress': return '#2196F3';
      case 'completed': return '#4CAF50';
      case 'failed': return '#f44336';
      case 'rolled_back': return '#ff9800';
      default: return '#999';
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
    }
  };

  return (
    <div className="migration-control-panel">
      <div className="panel-header">
        <h2>🔄 迁移控制面板</h2>
        <div className="header-actions">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="config-button"
            disabled={isMigrating}
          >
            ⚙️ 配置
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="history-button"
          >
            📜 历史
          </button>
        </div>
      </div>

      {/* 同步状态概览 */}
      {syncStatus && (
        <div className="sync-status-overview">
          <h3>📊 数据同步状态</h3>
          <div className="status-grid">
            <div className={`status-card ${syncStatus.localStorage ? 'ok' : 'error'}`}>
              <div className="status-icon">📱</div>
              <div className="status-info">
                <div className="status-label">LocalStorage</div>
                <div className="status-value">{syncStatus.localStorage ? '正常' : '异常'}</div>
              </div>
            </div>
            <div className={`status-card ${syncStatus.api ? 'ok' : 'error'}`}>
              <div className="status-icon">🌐</div>
              <div className="status-info">
                <div className="status-label">API</div>
                <div className="status-value">{syncStatus.api ? '正常' : '异常'}</div>
              </div>
            </div>
            <div className="status-card">
              <div className="status-icon">📈</div>
              <div className="status-info">
                <div className="status-label">总记录数</div>
                <div className="status-value">{syncStatus.totalRecords}</div>
              </div>
            </div>
            <div className="status-card">
              <div className="status-icon">✅</div>
              <div className="status-info">
                <div className="status-label">已同步</div>
                <div className="status-value">{syncStatus.syncedRecords}</div>
              </div>
            </div>
          </div>

          {syncStatus.conflicts.length > 0 && (
            <div className="conflicts-warning">
              ⚠️ 发现 {syncStatus.conflicts.length} 个数据冲突需要处理
            </div>
          )}
        </div>
      )}

      {/* 迁移阶段进度 */}
      {phases.length > 0 && (
        <div className="migration-phases">
          <h3>
            📋 迁移进度
            {currentSession && <span className="session-id">会话: {currentSession}</span>}
          </h3>
          <div className="phases-list">
            {phases.map((phase, index) => (
              <div
                key={phase.id}
                className="phase-item"
                style={{ borderLeftColor: getStatusColor(phase.status) }}
              >
                <div className="phase-header">
                  <div className="phase-icon">
                    {getPhaseIcon(phase.status)}
                  </div>
                  <div className="phase-info">
                    <div className="phase-name">{phase.name}</div>
                    <div className="phase-desc">{phase.description}</div>
                  </div>
                  <div className="phase-status">
                    <div className="status-text" style={{ color: getStatusColor(phase.status) }}>
                      {phase.status === 'in_progress' ? `${phase.progress}%` :
                       phase.status === 'completed' ? '已完成' :
                       phase.status === 'failed' ? '失败' :
                       phase.status === 'rolled_back' ? '已回滚' : '等待中'}
                    </div>
                    {phase.error && (
                      <div className="error-message">{phase.error}</div>
                    )}
                  </div>
                </div>

                {phase.status === 'in_progress' && (
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${phase.progress}%` }}
                    />
                  </div>
                )}

                {phase.startTime && (
                  <div className="phase-timing">
                    开始时间: {phase.startTime.toLocaleString()}
                    {phase.endTime && (
                      <>
                        {' | '} 耗时: {formatDuration(phase.endTime.getTime() - phase.startTime.getTime())}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 控制按钮 */}
      <div className="control-actions">
        <button
          onClick={startMigration}
          disabled={isMigrating}
          className="start-button"
        >
          {isMigrating ? '⏳ 迁移进行中...' : '🚀 开始迁移'}
        </button>

        {isMigrating && (
          <button
            onClick={() => {
              if (confirm('确定要取消当前迁移吗？可能需要手动回滚。')) {
                // 这里可以添加取消迁移的逻辑
                setIsMigrating(false);
              }
            }}
            className="cancel-button"
          >
            ❌ 取消迁移
          </button>
        )}

        <button
          onClick={() => loadSyncStatus()}
          disabled={isMigrating}
          className="refresh-button"
        >
          🔄 刷新状态
        </button>
      </div>

      {/* 配置面板 */}
      {showConfig && showAdvanced && (
        <div className="config-panel">
          <h3>⚙️ 迁移配置</h3>
          <div className="config-grid">
            <div className="config-item">
              <label>
                <input
                  type="checkbox"
                  checked={config.enableAutoBackup}
                  onChange={(e) => handleConfigChange('enableAutoBackup', e.target.checked)}
                />
                启用自动备份
              </label>
            </div>
            <div className="config-item">
              <label>
                <input
                  type="checkbox"
                  checked={config.enableValidation}
                  onChange={(e) => handleConfigChange('enableValidation', e.target.checked)}
                />
                启用数据验证
              </label>
            </div>
            <div className="config-item">
              <label>
                <input
                  type="checkbox"
                  checked={config.enableRollback}
                  onChange={(e) => handleConfigChange('enableRollback', e.target.checked)}
                />
                启用自动回滚
              </label>
            </div>
            <div className="config-item">
              <label>
                批量大小:
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={config.batchSize}
                  onChange={(e) => handleConfigChange('batchSize', parseInt(e.target.value) || 50)}
                />
              </label>
            </div>
            <div className="config-item">
              <label>
                重试次数:
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={config.retryAttempts}
                  onChange={(e) => handleConfigChange('retryAttempts', parseInt(e.target.value) || 3)}
                />
              </label>
            </div>
            <div className="config-item">
              <label>
                阶段延迟(ms):
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={config.delayBetweenPhases}
                  onChange={(e) => handleConfigChange('delayBetweenPhases', parseInt(e.target.value) || 1000)}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 历史记录 */}
      {showHistory && history.length > 0 && (
        <div className="history-panel">
          <h3>📜 迁移历史</h3>
          <div className="history-list">
            {history.map((report) => (
              <div key={report.sessionId} className="history-item">
                <div className="history-header">
                  <div className="history-session">
                    会话: {report.sessionId}
                  </div>
                  <div className="history-time">
                    {report.startTime.toLocaleString()}
                  </div>
                  <div className="history-summary">
                    {report.summary.completedPhases}/{report.summary.totalPhases} 阶段完成
                    {' | '}
                    {report.summary.successRate.toFixed(1)}% 成功率
                  </div>
                </div>
                <div className="history-details">
                  <span>迁移记录: {report.summary.migratedRecords}/{report.summary.totalRecords}</span>
                  {report.endTime && (
                    <>
                      {' | '} 耗时: {formatDuration(report.endTime.getTime() - report.startTime.getTime())}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .migration-control-panel {
          max-width: 1000px;
          margin: 0 auto;
          padding: 24px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e0e0e0;
        }

        .panel-header h2 {
          margin: 0;
          color: #1976D2;
        }

        .header-actions {
          display: flex;
          gap: 8px;
        }

        .config-button,
        .history-button {
          padding: 8px 16px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          transition: background-color 0.3s ease;
        }

        .config-button:hover,
        .history-button:hover {
          background: #f5f5f5;
        }

        .sync-status-overview {
          margin-bottom: 32px;
        }

        .sync-status-overview h3 {
          margin: 0 0 16px 0;
          color: #333;
        }

        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }

        .status-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          border-radius: 8px;
          background: #f8f9fa;
          border-left: 4px solid #ddd;
        }

        .status-card.ok {
          border-left-color: #4CAF50;
          background: #e8f5e8;
        }

        .status-card.error {
          border-left-color: #f44336;
          background: #ffebee;
        }

        .status-icon {
          font-size: 24px;
        }

        .status-info {
          flex: 1;
        }

        .status-label {
          font-size: 12px;
          color: #666;
          margin-bottom: 2px;
        }

        .status-value {
          font-weight: 600;
          color: #333;
        }

        .conflicts-warning {
          padding: 12px;
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 4px;
          color: #856404;
        }

        .migration-phases {
          margin-bottom: 32px;
        }

        .migration-phases h3 {
          margin: 0 0 16px 0;
          color: #333;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .session-id {
          font-size: 14px;
          color: #666;
          font-weight: normal;
        }

        .phases-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .phase-item {
          padding: 16px;
          border-radius: 8px;
          background: #f8f9fa;
          border-left: 4px solid #ddd;
          transition: all 0.3s ease;
        }

        .phase-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 8px;
        }

        .phase-icon {
          font-size: 20px;
          margin-top: 2px;
        }

        .phase-info {
          flex: 1;
        }

        .phase-name {
          font-weight: 600;
          color: #333;
          margin-bottom: 4px;
        }

        .phase-desc {
          font-size: 12px;
          color: #666;
        }

        .phase-status {
          text-align: right;
        }

        .status-text {
          font-weight: 500;
          margin-bottom: 4px;
        }

        .error-message {
          font-size: 12px;
          color: #f44336;
        }

        .progress-bar {
          height: 4px;
          background: #e0e0e0;
          border-radius: 2px;
          overflow: hidden;
          margin: 8px 0;
        }

        .progress-fill {
          height: 100%;
          background: #2196F3;
          transition: width 0.3s ease;
        }

        .phase-timing {
          font-size: 12px;
          color: #666;
        }

        .control-actions {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
        }

        .start-button,
        .cancel-button,
        .refresh-button {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .start-button {
          background: #4CAF50;
          color: white;
        }

        .start-button:hover:not(:disabled) {
          background: #45a049;
        }

        .cancel-button {
          background: #f44336;
          color: white;
        }

        .cancel-button:hover {
          background: #d32f2f;
        }

        .refresh-button {
          background: #2196F3;
          color: white;
        }

        .refresh-button:hover:not(:disabled) {
          background: #1976D2;
        }

        .start-button:disabled,
        .refresh-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .config-panel,
        .history-panel {
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
          margin-bottom: 24px;
        }

        .config-panel h3,
        .history-panel h3 {
          margin: 0 0 16px 0;
          color: #333;
        }

        .config-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
        }

        .config-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .config-item label {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #333;
        }

        .config-item input[type="checkbox"] {
          margin: 0;
        }

        .config-item input[type="number"] {
          width: 80px;
          padding: 4px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-left: 8px;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .history-item {
          padding: 16px;
          background: white;
          border-radius: 6px;
          border: 1px solid #e0e0e0;
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .history-session {
          font-weight: 600;
          color: #333;
        }

        .history-time {
          font-size: 12px;
          color: #666;
        }

        .history-summary {
          font-size: 14px;
          color: #555;
        }

        .history-details {
          font-size: 12px;
          color: #666;
        }
      `}</style>
    </div>
  );
};

export default MigrationControlPanel;