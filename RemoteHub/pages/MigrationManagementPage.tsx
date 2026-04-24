/**
 * 迁移管理页面
 * 提供完整的localStorage到API迁移管理功能
 */

import React, { useState, useEffect } from 'react';
import MigrationWizard from '../components/MigrationWizard';
import MigrationControlPanel from '../components/MigrationControlPanel';
import StorageModeToggle from '../components/StorageModeToggle';
import { migrationService } from '../services/migration.service';
import { progressiveMigrationManager } from '../services/progressiveMigrationManager';

interface MigrationStats {
  localStorageSize: number;
  apiSize: number;
  lastSyncTime: Date | null;
  conflicts: number;
  isApiHealthy: boolean;
}

const MigrationManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'wizard' | 'control' | 'status' | 'settings'>('wizard');
  const [migrationComplete, setMigrationComplete] = useState(false);
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadMigrationStats();
    checkMigrationStatus();

    // 定期刷新统计
    const interval = setInterval(loadMigrationStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadMigrationStats = async () => {
    try {
      // 计算localStorage大小
      let localStorageSize = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          localStorageSize += localStorage[key].length + key.length;
        }
      }

      // 获取同步状态
      const syncStatus = await migrationService.getSyncStatus();

      // 检查API健康状态
      const isApiHealthy = await checkApiHealth();

      setStats({
        localStorageSize,
        apiSize: syncStatus.syncedRecords * 200, // 估算大小
        lastSyncTime: syncStatus.lastSyncAt,
        conflicts: syncStatus.conflicts.length,
        isApiHealthy
      });
    } catch (error) {
      console.error('加载迁移统计失败:', error);
    }
  };

  const checkMigrationStatus = async () => {
    try {
      const progress = await migrationService.getMigrationProgress();
      setMigrationComplete(progress.isCompleted);
    } catch (error) {
      console.error('检查迁移状态失败:', error);
    }
  };

  const checkApiHealth = async (): Promise<boolean> => {
    try {
      const { getStorage } = await import('../services/storage.adapter');
      const storage = await getStorage();
      return await (storage as any).healthCheck();
    } catch (error) {
      return false;
    }
  };

  const handleMigrationComplete = (report: any) => {
    setMigrationComplete(true);
    setActiveTab('status');
    loadMigrationStats();
  };

  const handleMigrationError = (error: Error) => {
    console.error('迁移失败:', error);
    setActiveTab('wizard');
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDateTime = (date: Date | null): string => {
    if (!date) return '从未同步';
    return date.toLocaleString('zh-CN');
  };

  return (
    <div className="migration-management-page">
      <div className="page-header">
        <h1>🔄 数据迁移管理</h1>
        <p>安全地将RemoteHub数据从localStorage迁移到云端API</p>
      </div>

      {/* 迁移概览卡片 */}
      {stats && (
        <div className="overview-cards">
          <div className={`stat-card ${stats.isApiHealthy ? 'healthy' : 'unhealthy'}`}>
            <div className="stat-icon">🌐</div>
            <div className="stat-content">
              <div className="stat-title">API状态</div>
              <div className="stat-value">{stats.isApiHealthy ? '正常' : '异常'}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📱</div>
            <div className="stat-content">
              <div className="stat-title">LocalStorage</div>
              <div className="stat-value">{formatBytes(stats.localStorageSize)}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">☁️</div>
            <div className="stat-content">
              <div className="stat-title">API数据</div>
              <div className="stat-value">{formatBytes(stats.apiSize)}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🔄</div>
            <div className="stat-content">
              <div className="stat-title">最后同步</div>
              <div className="stat-value">{formatDateTime(stats.lastSyncTime)}</div>
            </div>
          </div>

          <div className={`stat-card ${stats.conflicts > 0 ? 'warning' : 'ok'}`}>
            <div className="stat-icon">⚠️</div>
            <div className="stat-content">
              <div className="stat-title">数据冲突</div>
              <div className="stat-value">{stats.conflicts}</div>
            </div>
          </div>

          <div className={`stat-card ${migrationComplete ? 'success' : 'pending'}`}>
            <div className="stat-icon">{migrationComplete ? '✅' : '⏳'}</div>
            <div className="stat-content">
              <div className="stat-title">迁移状态</div>
              <div className="stat-value">{migrationComplete ? '已完成' : '待处理'}</div>
            </div>
          </div>
        </div>
      )}

      {/* 存储模式切换 */}
      <div className="mode-toggle-section">
        <StorageModeToggle
          onModeChange={(mode) => {
            console.log('存储模式切换到:', mode);
          }}
          showAdvanced={showAdvanced}
        />
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="advanced-toggle"
        >
          {showAdvanced ? '隐藏' : '显示'}高级选项
        </button>
      </div>

      {/* 标签页导航 */}
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === 'wizard' ? 'active' : ''}`}
          onClick={() => setActiveTab('wizard')}
        >
          🧙 迁移向导
        </button>
        <button
          className={`tab-button ${activeTab === 'control' ? 'active' : ''}`}
          onClick={() => setActiveTab('control')}
        >
          🎛️ 控制面板
        </button>
        <button
          className={`tab-button ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          📊 状态监控
        </button>
        <button
          className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ 迁移设置
        </button>
      </div>

      {/* 标签页内容 */}
      <div className="tab-content">
        {activeTab === 'wizard' && (
          <div className="wizard-tab">
            {migrationComplete ? (
              <div className="migration-complete-notice">
                <h2>✅ 迁移已完成</h2>
                <p>数据已成功迁移到API模式。您可以继续使用迁移控制面板进行监控和管理。</p>
                <button
                  onClick={() => setActiveTab('status')}
                  className="view-status-button"
                >
                  查看状态
                </button>
              </div>
            ) : (
              <MigrationWizard
                onComplete={() => {
                  setMigrationComplete(true);
                  handleMigrationComplete({} as any);
                }}
                onCancel={() => setActiveTab('status')}
              />
            )}
          </div>
        )}

        {activeTab === 'control' && (
          <div className="control-tab">
            <MigrationControlPanel
              onMigrationComplete={handleMigrationComplete}
              onMigrationError={handleMigrationError}
              showAdvanced={showAdvanced}
            />
          </div>
        )}

        {activeTab === 'status' && (
          <div className="status-tab">
            <h2>📊 迁移状态监控</h2>
            <div className="status-content">
              {migrationComplete ? (
                <div className="completion-status">
                  <div className="success-indicator">
                    <div className="success-icon">🎉</div>
                    <h3>迁移成功完成！</h3>
                    <p>所有数据已安全迁移到云端API，RemoteHub现在运行在API模式下。</p>
                  </div>

                  <div className="next-steps">
                    <h4>建议的后续操作：</h4>
                    <ul>
                      <li>✅ 测试所有核心功能是否正常工作</li>
                      <li>✅ 验证数据完整性和一致性</li>
                      <li>✅ 尝试在不同设备上登录并同步数据</li>
                      <li>⏳ 保留备份数据7天以确保安全</li>
                      <li>⏳ 监控系统性能和错误日志</li>
                    </ul>
                  </div>

                  <div className="migration-actions">
                    <button
                      onClick={async () => {
                        try {
                          await migrationService.performIncrementalSync();
                          alert('增量同步完成！');
                        } catch (error) {
                          alert('同步失败: ' + error);
                        }
                      }}
                      className="sync-button"
                    >
                      🔄 执行增量同步
                    </button>

                    <button
                      onClick={() => setActiveTab('control')}
                      className="control-button"
                    >
                      🎛️ 打开控制面板
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pending-status">
                  <div className="pending-indicator">
                    <div className="pending-icon">⏳</div>
                    <h3>迁移待处理</h3>
                    <p>检测到localStorage中有数据，但尚未完成到API的迁移。</p>
                  </div>

                  <div className="migration-info">
                    <h4>迁移的好处：</h4>
                    <ul>
                      <li>🌐 多设备数据同步</li>
                      <li>☁️ 云端数据备份</li>
                      <li>🔒 增强的数据安全性</li>
                      <li>📈 更好的性能和扩展性</li>
                    </ul>
                  </div>

                  <div className="migration-actions">
                    <button
                      onClick={() => setActiveTab('wizard')}
                      className="start-migration-button"
                    >
                      🧙 开始迁移向导
                    </button>

                    <button
                      onClick={() => setActiveTab('control')}
                      className="advanced-migration-button"
                    >
                      🎛️ 高级迁移控制
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="settings-tab">
            <h2>⚙️ 迁移设置</h2>
            <div className="settings-content">
              <div className="setting-group">
                <h3>🔄 自动同步设置</h3>
                <div className="setting-item">
                  <label>
                    <input type="checkbox" defaultChecked />
                    启用自动增量同步
                  </label>
                  <p>定期检测localStorage和API之间的数据差异并自动同步</p>
                </div>
                <div className="setting-item">
                  <label>
                    同步间隔:
                    <select defaultValue="5">
                      <option value="1">1分钟</option>
                      <option value="5">5分钟</option>
                      <option value="15">15分钟</option>
                      <option value="30">30分钟</option>
                      <option value="60">1小时</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="setting-group">
                <h3>💾 备份设置</h3>
                <div className="setting-item">
                  <label>
                    <input type="checkbox" defaultChecked />
                    迁移前自动创建备份
                  </label>
                  <p>在执行任何数据迁移操作前自动创建完整备份</p>
                </div>
                <div className="setting-item">
                  <label>
                    备份保留时间:
                    <select defaultValue="30">
                      <option value="7">7天</option>
                      <option value="30">30天</option>
                      <option value="90">90天</option>
                      <option value="0">永久保留</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="setting-group">
                <h3>🔧 高级设置</h3>
                <div className="setting-item">
                  <label>
                    批量大小:
                    <input type="number" defaultValue="50" min="1" max="200" />
                  </label>
                  <p>每次API调用处理的数据记录数量</p>
                </div>
                <div className="setting-item">
                  <label>
                    重试次数:
                    <input type="number" defaultValue="3" min="0" max="10" />
                  </label>
                  <p>API请求失败时的自动重试次数</p>
                </div>
                <div className="setting-item">
                  <label>
                    <input type="checkbox" defaultChecked />
                    启用详细日志
                  </label>
                  <p>记录详细的迁移过程日志用于故障排除</p>
                </div>
              </div>

              <div className="setting-actions">
                <button className="save-settings-button">
                  💾 保存设置
                </button>
                <button className="reset-settings-button">
                  🔄 重置为默认
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .migration-management-page {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px;
          background: #f5f5f5;
          min-height: 100vh;
        }

        .page-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .page-header h1 {
          margin: 0 0 8px 0;
          color: #1976D2;
          font-size: 32px;
        }

        .page-header p {
          margin: 0;
          color: #666;
          font-size: 16px;
        }

        .overview-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .stat-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          border-left: 4px solid #ddd;
        }

        .stat-card.healthy {
          border-left-color: #4CAF50;
        }

        .stat-card.unhealthy {
          border-left-color: #f44336;
        }

        .stat-card.warning {
          border-left-color: #ff9800;
        }

        .stat-card.ok {
          border-left-color: #4CAF50;
        }

        .stat-card.success {
          border-left-color: #4CAF50;
        }

        .stat-card.pending {
          border-left-color: #ff9800;
        }

        .stat-icon {
          font-size: 24px;
        }

        .stat-content {
          flex: 1;
        }

        .stat-title {
          font-size: 12px;
          color: #666;
          margin-bottom: 4px;
        }

        .stat-value {
          font-weight: 600;
          color: #333;
        }

        .mode-toggle-section {
          margin-bottom: 32px;
          position: relative;
        }

        .advanced-toggle {
          position: absolute;
          top: 16px;
          right: 16px;
          padding: 6px 12px;
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        }

        .tab-navigation {
          display: flex;
          background: white;
          border-radius: 8px 8px 0 0;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .tab-button {
          flex: 1;
          padding: 16px;
          background: #f8f9fa;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.3s ease;
        }

        .tab-button:hover {
          background: #e9ecef;
        }

        .tab-button.active {
          background: white;
          border-bottom-color: #2196F3;
          color: #2196F3;
        }

        .tab-content {
          background: white;
          border-radius: 0 0 8px 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          min-height: 400px;
        }

        .wizard-tab,
        .control-tab,
        .status-tab,
        .settings-tab {
          padding: 24px;
        }

        .migration-complete-notice {
          text-align: center;
          padding: 40px;
        }

        .migration-complete-notice h2 {
          color: #4CAF50;
          margin-bottom: 16px;
        }

        .view-status-button {
          padding: 12px 24px;
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          margin-top: 16px;
        }

        .completion-status {
          max-width: 600px;
          margin: 0 auto;
        }

        .success-indicator {
          text-align: center;
          margin-bottom: 32px;
        }

        .success-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .next-steps {
          background: #e8f5e8;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 32px;
        }

        .next-steps h4 {
          margin: 0 0 12px 0;
          color: #2e7d32;
        }

        .next-steps ul {
          margin: 0;
          padding-left: 20px;
        }

        .next-steps li {
          margin: 8px 0;
          color: #1b5e20;
        }

        .migration-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .sync-button,
        .control-button {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background-color 0.3s ease;
        }

        .sync-button {
          background: #4CAF50;
          color: white;
        }

        .sync-button:hover {
          background: #45a049;
        }

        .control-button {
          background: #2196F3;
          color: white;
        }

        .control-button:hover {
          background: #1976D2;
        }

        .pending-status {
          max-width: 600px;
          margin: 0 auto;
        }

        .pending-indicator {
          text-align: center;
          margin-bottom: 32px;
        }

        .pending-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .migration-info {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 32px;
        }

        .migration-info h4 {
          margin: 0 0 12px 0;
          color: #333;
        }

        .migration-info ul {
          margin: 0;
          padding-left: 20px;
        }

        .migration-info li {
          margin: 8px 0;
          color: #555;
        }

        .start-migration-button,
        .advanced-migration-button {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.3s ease;
        }

        .start-migration-button {
          background: #4CAF50;
          color: white;
        }

        .start-migration-button:hover {
          background: #45a049;
        }

        .advanced-migration-button {
          background: #ff9800;
          color: white;
        }

        .advanced-migration-button:hover {
          background: #f57c00;
        }

        .settings-content {
          max-width: 800px;
        }

        .setting-group {
          margin-bottom: 32px;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .setting-group h3 {
          margin: 0 0 16px 0;
          color: #333;
        }

        .setting-item {
          margin-bottom: 16px;
        }

        .setting-item:last-child {
          margin-bottom: 0;
        }

        .setting-item label {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #333;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .setting-item p {
          margin: 4px 0 0 0;
          color: #666;
          font-size: 12px;
        }

        .setting-item input[type="checkbox"] {
          margin: 0;
        }

        .setting-item input[type="number"],
        .setting-item select {
          padding: 6px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-left: 8px;
        }

        .setting-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .save-settings-button,
        .reset-settings-button {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background-color 0.3s ease;
        }

        .save-settings-button {
          background: #4CAF50;
          color: white;
        }

        .save-settings-button:hover {
          background: #45a049;
        }

        .reset-settings-button {
          background: #f44336;
          color: white;
        }

        .reset-settings-button:hover {
          background: #d32f2f;
        }
      `}</style>
    </div>
  );
};

export default MigrationManagementPage;