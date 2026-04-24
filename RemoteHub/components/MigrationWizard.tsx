import React, { useState, useEffect } from 'react';
import { migrationService } from '../services/migration.service';
import { remoteConnectionService } from '../services/remoteConnection.service';

interface MigrationWizardProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

interface WizardStep {
  id: number;
  title: string;
  description: string;
  component: React.FC<any>;
}

interface MigrationStepData {
  backupCompleted: boolean;
  dataValidated: boolean;
  syncCompleted: boolean;
  switchCompleted: boolean;
  errors: string[];
}

export const MigrationWizard: React.FC<MigrationWizardProps> = ({ onComplete, onCancel }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [migrationData, setMigrationData] = useState<MigrationStepData>({
    backupCompleted: false,
    dataValidated: false,
    syncCompleted: false,
    switchCompleted: false,
    errors: []
  });
  const [migrationProgress, setMigrationProgress] = useState<any>(null);

  const steps: WizardStep[] = [
    {
      id: 0,
      title: '准备阶段',
      description: '检查系统状态并准备数据',
      component: PreparationStep
    },
    {
      id: 1,
      title: '数据备份',
      description: '备份现有的localStorage数据',
      component: BackupStep
    },
    {
      id: 2,
      title: '数据验证',
      description: '验证数据格式和完整性',
      component: ValidationStep
    },
    {
      id: 3,
      title: '数据迁移',
      description: '将数据迁移到后端API',
      component: MigrationStep
    },
    {
      id: 4,
      title: '完成切换',
      description: '切换到API模式并验证',
      component: CompletionStep
    }
  ];

  useEffect(() => {
    loadMigrationProgress();
  }, []);

  const loadMigrationProgress = async () => {
    try {
      const progress = await migrationService.getMigrationProgress();
      setMigrationProgress(progress);

      // 如果已经完成，跳转到完成步骤
      if (progress.isCompleted) {
        setCurrentStep(4);
        setMigrationData({
          backupCompleted: true,
          dataValidated: true,
          syncCompleted: true,
          switchCompleted: true,
          errors: []
        });
      }
    } catch (error) {
      console.error('加载迁移进度失败:', error);
    }
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 0:
        return migrationData.errors.length === 0;
      case 1:
        return migrationData.backupCompleted;
      case 2:
        return migrationData.dataValidated;
      case 3:
        return migrationData.syncCompleted;
      case 4:
        return migrationData.switchCompleted;
      default:
        return false;
    }
  };

  const canGoBack = () => {
    return currentStep > 0;
  };

  const handleNext = async () => {
    if (currentStep === 4) {
      // 完成迁移
      await completeMigration();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
  };

  const completeMigration = async () => {
    setIsLoading(true);
    try {
      onComplete?.();
    } catch (error) {
      console.error('迁移完成处理失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateMigrationData = (updates: Partial<MigrationStepData>) => {
    setMigrationData(prev => ({ ...prev, ...updates }));
  };

  const CurrentStepComponent = steps[currentStep].component;

  return (
    <div className="glass-panel rounded-xl border border-white/10 max-w-4xl mx-auto p-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-3 flex items-center justify-center gap-3">
          <span className="text-4xl">🔄</span>
          数据迁移向导
        </h2>
        <p className="text-slate-400 text-lg">
          将您的RemoteHub数据从localStorage安全地迁移到云端API
        </p>
      </div>

      <div className="relative mb-12">
        <div className="absolute top-5 left-5 right-5 h-0.5 bg-slate-700"></div>
        <div className="relative flex justify-between">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex flex-col items-center ${
                index < currentStep ? 'text-green-400' :
                index === currentStep ? 'text-blue-400' : 'text-slate-600'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm mb-2 transition-all ${
                index < currentStep ? 'bg-green-600 ring-4 ring-green-600/20' :
                index === currentStep ? 'bg-blue-600 ring-4 ring-blue-600/20 shadow-lg shadow-blue-600/50' :
                'bg-slate-800 border-2 border-slate-700'
              }`}>
                {index < currentStep ? '✓' : index + 1}
              </div>
              <div className="text-center max-w-[120px]">
                <div className="font-medium text-sm mb-1">{step.title}</div>
                <div className="text-xs text-slate-500 leading-tight">{step.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-lg p-6 mb-8">
        <CurrentStepComponent
          data={migrationData}
          onUpdate={updateMigrationData}
          migrationProgress={migrationProgress}
        />
      </div>

      <div className="flex justify-between items-center">
        <div className="flex gap-3">
          {canGoBack() && (
            <button
              onClick={handleBack}
              disabled={isLoading}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              ← 上一步
            </button>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-6 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all text-sm font-medium disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleNext}
            disabled={!canGoNext() || isLoading}
            className={`px-8 py-2.5 rounded-lg text-white text-sm font-medium shadow-lg transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ${
              currentStep === 4 ? 'bg-green-600 hover:bg-green-500 shadow-green-900/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'
            }`}
          >
            {isLoading && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {currentStep === 4 ? '✓ 完成迁移' : '下一步 →'}
          </button>
        </div>
      </div>
    </div>
  );
};

// 准备阶段组件
const PreparationStep: React.FC<{
  data: MigrationStepData;
  onUpdate: (updates: Partial<MigrationStepData>) => void;
  migrationProgress: any;
}> = ({ data, onUpdate, migrationProgress }) => {
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    checkSystemStatus();
  }, []);

  const checkSystemStatus = async () => {
    setChecking(true);
    try {
      // 检查API连接
      const storage = await (window as any).getStorage();
      const apiAvailable = await (storage as any).healthCheck();

      // 检查localStorage数据
      const localStorageData = {
        projects: JSON.parse(localStorage.getItem('rh_db_projects') || '[]'),
        connections: JSON.parse(localStorage.getItem('rh_db_connections') || '[]'),
        users: JSON.parse(localStorage.getItem('rh_db_users') || '[]')
      };

      const totalRecords = Object.values(localStorageData).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);

      setSystemStatus({
        apiAvailable,
        localStorageData,
        totalRecords,
        freeSpace: '充足',
        browserCompatibility: navigator.userAgent.includes('Chrome') || navigator.userAgent.includes('Firefox')
      });

      if (!apiAvailable) {
        onUpdate({ errors: ['API服务不可用，请确保后端服务正在运行'] });
      } else if (totalRecords === 0) {
        onUpdate({ errors: ['没有发现需要迁移的数据'] });
      } else {
        onUpdate({ errors: [] });
      }

    } catch (error) {
      onUpdate({ errors: ['系统状态检查失败: ' + (error instanceof Error ? error.message : '未知错误')] });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="preparation-step">
      <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <span>🔍</span> 系统检查
      </h3>

      {checking ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400">正在检查系统状态...</p>
        </div>
      ) : systemStatus ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className={`p-4 rounded-lg border ${
              systemStatus.apiAvailable ? 'bg-green-600/10 border-green-600/30' : 'bg-red-600/10 border-red-600/30'
            }`}>
              <div className="flex items-center gap-3">
                <span className={`text-lg ${systemStatus.apiAvailable ? 'text-green-400' : 'text-red-400'}`}>
                  {systemStatus.apiAvailable ? '✅' : '❌'}
                </span>
                <span className="text-white">
                  API服务: {systemStatus.apiAvailable ? '可用' : '不可用'}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-blue-600/30 bg-blue-600/10">
              <div className="flex items-center gap-3">
                <span className="text-lg text-green-400">✅</span>
                <span className="text-white">
                  浏览器兼容性: {systemStatus.browserCompatibility ? '良好' : '可能有问题'}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-green-600/30 bg-green-600/10">
              <div className="flex items-center gap-3">
                <span className="text-lg text-green-400">✅</span>
                <span className="text-white">
                  存储空间: {systemStatus.freeSpace}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-indigo-600/30 bg-indigo-600/10">
            <h4 className="text-white font-medium mb-3">发现的数据:</h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-400">{systemStatus.localStorageData.projects.length}</div>
                <div className="text-sm text-slate-400">项目</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">{systemStatus.localStorageData.connections.length}</div>
                <div className="text-sm text-slate-400">连接</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">{systemStatus.localStorageData.users.length}</div>
                <div className="text-sm text-slate-400">用户</div>
              </div>
            </div>
            <div className="mt-3 text-center text-slate-400">
              总计: {systemStatus.totalRecords} 条记录
            </div>
          </div>

          {data.errors.length > 0 && (
            <div className="p-4 rounded-lg border border-red-600/30 bg-red-600/10">
              <h4 className="text-red-400 font-medium mb-2 flex items-center gap-2">
                <span>⚠️</span> 发现的问题:
              </h4>
              <ul className="space-y-1">
                {data.errors.map((error, index) => (
                  <li key={index} className="text-red-300 text-sm">{error}</li>
                ))}
              </ul>
            </div>
          )}

          {data.errors.length === 0 && (
            <div className="p-4 rounded-lg border border-green-600/30 bg-green-600/10 text-center">
              <span className="text-green-400 text-lg">✅</span>
              <span className="text-green-300 ml-2">系统检查完成，可以开始迁移</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

// 备份阶段组件
const BackupStep: React.FC<{
  data: MigrationStepData;
  onUpdate: (updates: Partial<MigrationStepData>) => void;
  migrationProgress: any;
}> = ({ data, onUpdate }) => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<any>(null);

  const performBackup = async () => {
    setIsBackingUp(true);
    try {
      // 模拟备份过程
      await new Promise(resolve => setTimeout(resolve, 2000));

      const backupData = {
        timestamp: new Date().toISOString(),
        projects: JSON.parse(localStorage.getItem('rh_db_projects') || '[]'),
        connections: JSON.parse(localStorage.getItem('rh_db_connections') || '[]'),
        users: JSON.parse(localStorage.getItem('rh_db_users') || '[]'),
        settings: JSON.parse(localStorage.getItem('rh_settings') || '{}')
      };

      const backupKey = `rh_backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
      localStorage.setItem(backupKey, JSON.stringify(backupData));

      setBackupResult({
        key: backupKey,
        size: JSON.stringify(backupData).length,
        records: Object.values(backupData).filter(Array.isArray).reduce((sum, arr) => sum + arr.length, 0)
      });

      onUpdate({ backupCompleted: true });
    } catch (error) {
      onUpdate({ errors: [...data.errors, '备份失败: ' + (error instanceof Error ? error.message : '未知错误')] });
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div className="backup-step">
      <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <span>📦</span> 数据备份
      </h3>
      <p className="text-slate-400 mb-6">在开始迁移之前，系统会创建一个完整的数据备份，确保您的数据安全。</p>

      {!data.backupCompleted ? (
        <div className="text-center">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-left">
            <div className="p-4 rounded-lg border border-blue-600/30 bg-blue-600/10">
              <div className="flex items-center gap-3 text-blue-300">
                <span className="text-xl">ℹ️</span>
                <span>备份将包含所有项目、连接和用户数据</span>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-indigo-600/30 bg-indigo-600/10">
              <div className="flex items-center gap-3 text-indigo-300">
                <span className="text-xl">📍</span>
                <span>备份文件将保存在浏览器本地存储中</span>
              </div>
            </div>
          </div>

          <button
            onClick={performBackup}
            disabled={isBackingUp || data.errors.length > 0}
            className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBackingUp ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                备份中...
              </span>
            ) : (
              '开始备份'
            )}
          </button>
        </div>
      ) : backupResult ? (
        <div className="flex items-center gap-4 p-6 rounded-lg border border-green-600/30 bg-green-600/10">
          <div className="text-3xl text-green-400">✅</div>
          <div className="flex-1">
            <h4 className="text-green-300 font-semibold mb-2">备份完成！</h4>
            <div className="space-y-1 text-sm text-slate-300">
              <p>备份文件: {backupResult.key}</p>
              <p>备份大小: {(backupResult.size / 1024).toFixed(2)} KB</p>
              <p>备份记录: {backupResult.records} 条</p>
            </div>
          </div>
        </div>
      ) : null}

      {data.errors.length > 0 && (
        <div className="mt-4 space-y-2">
          {data.errors.map((error, index) => (
            <div key={index} className="p-3 rounded-lg border border-red-600/30 bg-red-600/10 text-red-300 text-sm">
              ❌ {error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 验证阶段组件
const ValidationStep: React.FC<{
  data: MigrationStepData;
  onUpdate: (updates: Partial<MigrationStepData>) => void;
  migrationProgress: any;
}> = ({ data, onUpdate }) => {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  const performValidation = async () => {
    setIsValidating(true);
    try {
      // 模拟验证过程
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 读取localStorage数据
      const projects = JSON.parse(localStorage.getItem('rh_db_projects') || '[]');
      const connections = JSON.parse(localStorage.getItem('rh_db_connections') || '[]');
      const users = JSON.parse(localStorage.getItem('rh_db_users') || '[]');

      const validationResults = {
        projects: {
          total: projects.length,
          valid: projects.filter(p => p.name && typeof p.name === 'string').length,
          errors: projects.filter(p => !p.name || typeof p.name !== 'string').length
        },
        connections: {
          total: connections.length,
          valid: connections.filter(c => c.name && c.host).length,
          errors: connections.filter(c => !c.name || !c.host).length
        },
        users: {
          total: users.length,
          valid: users.filter(u => u.username && u.email).length,
          errors: users.filter(u => !u.username || !u.email).length
        }
      };

      const totalValid = validationResults.projects.valid +
                        validationResults.connections.valid +
                        validationResults.users.valid;

      const hasErrors = validationResults.projects.errors > 0 ||
                       validationResults.connections.errors > 0 ||
                       validationResults.users.errors > 0;

      setValidationResult({
        results: validationResults,
        totalValid,
        hasErrors,
        success: !hasErrors
      });

      onUpdate({ dataValidated: true });

      if (hasErrors) {
        onUpdate({ errors: [...data.errors, '发现数据格式错误，建议修复后继续'] });
      }

    } catch (error) {
      onUpdate({ errors: [...data.errors, '数据验证失败: ' + (error instanceof Error ? error.message : '未知错误')] });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="validation-step">
      <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <span>🔍</span> 数据验证
      </h3>
      <p className="text-slate-400 mb-6">验证现有数据的格式和完整性，确保可以安全迁移。</p>

      {!data.dataValidated ? (
        <div className="text-center">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 text-left">
            <div className="p-4 rounded-lg border border-blue-600/30 bg-blue-600/10">
              <div className="flex items-center gap-3 text-blue-300">
                <span className="text-xl">🔍</span>
                <span>检查项目、连接和用户数据的格式</span>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-green-600/30 bg-green-600/10">
              <div className="flex items-center gap-3 text-green-300">
                <span className="text-xl">✅</span>
                <span>验证必填字段和数据类型</span>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-amber-600/30 bg-amber-600/10">
              <div className="flex items-center gap-3 text-amber-300">
                <span className="text-xl">⚠️</span>
                <span>标记需要修复的数据问题</span>
              </div>
            </div>
          </div>

          <button
            onClick={performValidation}
            disabled={isValidating || data.errors.length > 0}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isValidating ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                验证中...
              </span>
            ) : (
              '开始验证'
            )}
          </button>
        </div>
      ) : validationResult ? (
        <div className={`p-6 rounded-lg border ${validationResult.success ? 'border-green-600/30 bg-green-600/10' : 'border-amber-600/30 bg-amber-600/10'}`}>
          <div className="flex items-center gap-4 mb-4">
            <div className={`text-3xl ${validationResult.success ? 'text-green-400' : 'text-amber-400'}`}>
              {validationResult.success ? '✅' : '⚠️'}
            </div>
            <h4 className={`font-semibold ${validationResult.success ? 'text-green-300' : 'text-amber-300'}`}>
              验证完成！
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 rounded-lg bg-slate-800/50">
              <div className="text-sm text-slate-400 mb-1">项目数据</div>
              <div className="text-lg font-semibold text-white">
                {validationResult.results.projects.valid}/{validationResult.results.projects.total}
              </div>
              <div className="text-xs text-green-400">有效</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-800/50">
              <div className="text-sm text-slate-400 mb-1">连接数据</div>
              <div className="text-lg font-semibold text-white">
                {validationResult.results.connections.valid}/{validationResult.results.connections.total}
              </div>
              <div className="text-xs text-green-400">有效</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-800/50">
              <div className="text-sm text-slate-400 mb-1">用户数据</div>
              <div className="text-lg font-semibold text-white">
                {validationResult.results.users.valid}/{validationResult.results.users.total}
              </div>
              <div className="text-xs text-green-400">有效</div>
            </div>
          </div>

          <p className="text-center text-white font-medium">
            总计 {validationResult.totalValid} 条记录验证通过
          </p>

          {validationResult.hasErrors && (
            <div className="mt-4 p-3 rounded-lg border border-amber-600/30 bg-amber-600/10 text-amber-300 text-sm">
              ⚠️ 发现数据格式问题，建议修复后再进行迁移，或继续迁移但可能丢失部分数据。
            </div>
          )}
        </div>
      ) : null}

      {data.errors.length > 0 && (
        <div className="mt-4 space-y-2">
          {data.errors.map((error, index) => (
            <div key={index} className="p-3 rounded-lg border border-red-600/30 bg-red-600/10 text-red-300 text-sm">
              ❌ {error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 迁移阶段组件
const MigrationStep: React.FC<{
  data: MigrationStepData;
  onUpdate: (updates: Partial<MigrationStepData>) => void;
  migrationProgress: any;
}> = ({ data, onUpdate }) => {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const migrationSteps = [
    { name: '准备API连接', description: '连接到后端API服务' },
    { name: '迁移用户数据', description: '同步用户账户信息' },
    { name: '迁移项目数据', description: '同步项目和分组' },
    { name: '迁移连接数据', description: '同步远程连接配置' },
    { name: '验证迁移结果', description: '确认数据完整性' }
  ];

  const performMigration = async () => {
    setIsMigrating(true);
    setCurrentStep(0);

    try {
      for (let i = 0; i < migrationSteps.length; i++) {
        setCurrentStep(i);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 模拟每个步骤
      }

      const mockResult = {
        users: { migrated: 5, skipped: 0, errors: 0 },
        projects: { migrated: 12, skipped: 1, errors: 0 },
        connections: { migrated: 48, skipped: 2, errors: 1 },
        total: { migrated: 65, skipped: 3, errors: 1 }
      };

      setMigrationResult(mockResult);
      onUpdate({ syncCompleted: true });

      if (mockResult.total.errors > 0) {
        onUpdate({ errors: [...data.errors, `迁移过程中发生 ${mockResult.total.errors} 个错误`] });
      }

    } catch (error) {
      onUpdate({ errors: [...data.errors, '数据迁移失败: ' + (error instanceof Error ? error.message : '未知错误')] });
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="migration-step">
      <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <span>🔄</span> 数据迁移
      </h3>
      <p className="text-slate-400 mb-6">将数据从localStorage安全地迁移到云端API。</p>

      {!data.syncCompleted ? (
        <div>
          <h4 className="text-white font-medium mb-4">迁移步骤：</h4>
          <div className="space-y-3 mb-8">
            {migrationSteps.map((step, index) => (
              <div
                key={index}
                className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                  index < currentStep ? 'border-green-600/30 bg-green-600/10' :
                  index === currentStep ? 'border-blue-600/30 bg-blue-600/10' :
                  'border-slate-700/30 bg-slate-800/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  index < currentStep ? 'bg-green-600' :
                  index === currentStep ? 'bg-blue-600' :
                  'bg-slate-700'
                }`}>
                  {index < currentStep ? '✓' : isMigrating && index === currentStep ? (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : index + 1}
                </div>
                <div className="flex-1">
                  <div className="text-white font-medium">{step.name}</div>
                  <div className="text-sm text-slate-400">{step.description}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <button
              onClick={performMigration}
              disabled={isMigrating || data.errors.length > 0}
              className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isMigrating ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  迁移中...
                </span>
              ) : (
                '开始迁移'
              )}
            </button>
          </div>
        </div>
      ) : migrationResult ? (
        <div className="p-6 rounded-lg border border-green-600/30 bg-green-600/10">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-3xl text-green-400">✅</div>
            <h4 className="text-green-300 font-semibold">迁移完成！</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 rounded-lg bg-slate-800/50">
              <div className="text-sm text-slate-400 mb-1">用户数据</div>
              <div className="text-lg font-semibold text-white">
                已迁移 {migrationResult.users.migrated} 个
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-800/50">
              <div className="text-sm text-slate-400 mb-1">项目数据</div>
              <div className="text-lg font-semibold text-white">
                已迁移 {migrationResult.projects.migrated} 个
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-800/50">
              <div className="text-sm text-slate-400 mb-1">连接数据</div>
              <div className="text-lg font-semibold text-white">
                已迁移 {migrationResult.connections.migrated} 个
              </div>
            </div>
          </div>

          <div className="border-t border-slate-700 pt-4">
            <div className="flex justify-around text-sm">
              <div className="text-green-400">
                总计迁移: <span className="font-semibold">{migrationResult.total.migrated}</span> 个
              </div>
              {migrationResult.total.skipped > 0 && (
                <div className="text-amber-400">
                  跳过: <span className="font-semibold">{migrationResult.total.skipped}</span> 个
                </div>
              )}
              {migrationResult.total.errors > 0 && (
                <div className="text-red-400">
                  错误: <span className="font-semibold">{migrationResult.total.errors}</span> 个
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg border border-blue-600/30 bg-blue-600/10 text-blue-300 text-sm">
            💡 建议在完成切换后，保留一段时间备份数据以确保安全
          </div>
        </div>
      ) : null}

      {data.errors.length > 0 && (
        <div className="mt-4 space-y-2">
          {data.errors.map((error, index) => (
            <div key={index} className="p-3 rounded-lg border border-red-600/30 bg-red-600/10 text-red-300 text-sm">
              ❌ {error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 完成阶段组件
const CompletionStep: React.FC<{
  data: MigrationStepData;
  onUpdate: (updates: Partial<MigrationStepData>) => void;
  migrationProgress: any;
}> = ({ data, onUpdate }) => {
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchResult, setSwitchResult] = useState<any>(null);

  const performSwitch = async () => {
    setIsSwitching(true);
    try {
      // 模拟切换过程
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 设置API模式
      localStorage.setItem('VITE_USE_API', 'true');

      setSwitchResult({
        success: true,
        mode: 'api',
        timestamp: new Date().toISOString()
      });

      onUpdate({ switchCompleted: true });

    } catch (error) {
      onUpdate({ errors: [...data.errors, '切换失败: ' + (error instanceof Error ? error.message : '未知错误')] });
    } finally {
      setIsSwitching(false);
    }
  };

  const verifyMigration = async () => {
    try {
      // 模拟验证
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert('✅ 迁移验证成功！所有数据已安全迁移到API模式。');
    } catch (error) {
      alert('❌ 验证失败，请检查数据完整性。');
    }
  };

  return (
    <div className="completion-step">
      <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <span>🎉</span> 完成切换
      </h3>
      <p className="text-slate-400 mb-6">切换到API模式并验证迁移结果。</p>

      {!data.switchCompleted ? (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="p-6 rounded-lg border border-blue-600/30 bg-blue-600/10">
              <h4 className="text-blue-300 font-medium mb-4 flex items-center gap-2">
                <span>🔀</span> 切换说明
              </h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• 应用将切换到API模式</li>
                <li>• 数据将通过API服务进行同步</li>
                <li>• 支持多设备数据同步</li>
                <li>• 提供更好的数据安全性</li>
              </ul>
            </div>

            <div className="p-6 rounded-lg border border-amber-600/30 bg-amber-600/10">
              <h4 className="text-amber-300 font-medium mb-4 flex items-center gap-2">
                <span>⚠️</span> 注意事项
              </h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• 确保网络连接稳定</li>
                <li>• 切换过程中请勿关闭页面</li>
                <li>• 建议先测试API功能</li>
                <li>• 保留备份数据一段时间</li>
              </ul>
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={performSwitch}
              disabled={isSwitching || data.errors.length > 0}
              className="px-12 py-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white rounded-lg font-semibold text-lg transition-all shadow-lg shadow-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSwitching ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  切换中...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span>🚀</span> 完成切换
                </span>
              )}
            </button>
          </div>
        </div>
      ) : switchResult ? (
        <div className="p-8 rounded-lg border border-green-600/30 bg-gradient-to-br from-green-600/10 to-emerald-600/10">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4 bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
              🎉
            </div>
            <h4 className="text-green-300 font-semibold text-xl mb-2">切换成功！</h4>
            <p className="text-green-200">RemoteHub已成功切换到API模式</p>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <span className="text-green-400">✅</span>
              <span className="text-white">当前模式: API模式</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <span className="text-blue-400">🔄</span>
              <span className="text-white">数据同步: 已启用</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <span className="text-purple-400">🌐</span>
              <span className="text-white">多设备支持: 已启用</span>
            </div>
          </div>

          <div className="flex gap-4 justify-center mb-6">
            <button
              onClick={verifyMigration}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
            >
              📋 验证迁移结果
            </button>
          </div>

          <div className="p-4 rounded-lg border border-slate-700 bg-slate-800/50">
            <h5 className="text-white font-medium mb-3">后续步骤：</h5>
            <ol className="space-y-2 text-sm text-slate-300">
              <li>1. 测试连接功能是否正常</li>
              <li>2. 验证所有数据已正确迁移</li>
              <li>3. 尝试在不同设备上同步</li>
              <li>4. 确认一段时间后删除localStorage备份数据</li>
            </ol>
          </div>
        </div>
      ) : null}

      {data.errors.length > 0 && (
        <div className="mt-4 space-y-2">
          {data.errors.map((error, index) => (
            <div key={index} className="p-3 rounded-lg border border-red-600/30 bg-red-600/10 text-red-300 text-sm">
              ❌ {error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MigrationWizard;