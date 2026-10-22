import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../../components/forms/Button';
import Card, { CardHeader, CardContent } from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import { getStore, LOCAL_USER } from '../../data/runtime';
import {
  createBackup,
  serializeBackup,
  parseBackup,
  restoreBackup,
  createSafetyBackup,
  backupFilename,
  describeRestore
} from '../../data/backup';
import { saveAndShare, pickBackupFile } from '../../services/fileExport';
import { isNativeBuild } from '../../services/platform';
import { formatMoney } from '../../utils/format';

/**
 * BACKUP & RESTORE (Android conversion — Phase F)
 * ===============================================
 *
 * Export: writes a versioned JSON file and offers it through the system
 *         share sheet (Android) or a normal download (web).
 *
 * Restore: pick a file -> validate -> PREVIEW what will change -> explicit
 *         confirmation -> a safety copy of the current data is taken ->
 *         the import runs in one transaction -> the result is verified.
 *
 * Nothing is ever overwritten silently.
 */
export default function BackupSettings() {
  const { isNative } = useAuth();

  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Restore flow state.
  const [pending, setPending] = useState(null); // { name, backup, summary }
  const [mode, setMode] = useState('replace');

  const clearFeedback = () => {
    setMessage(null);
    setError(null);
  };

  const handleExport = async () => {
    clearFeedback();
    setBusy('export');
    try {
      const { store } = await getStore();
      const backup = await createBackup(store.db, { userId: LOCAL_USER });
      const text = serializeBackup(backup);

      const filename = backupFilename();
      await saveAndShare(filename, text, 'Finance backup');

      setMessage(
        `Backup exported (${backup.counts.transactions} transactions, ` +
          `${backup.counts.accounts} accounts). Keep the file somewhere safe — ` +
          'it is the only copy of your data outside this device.'
      );
    } catch (err) {
      setError(err?.message ?? 'The backup could not be created');
    } finally {
      setBusy(null);
    }
  };

  const handlePickFile = async () => {
    clearFeedback();
    setBusy('pick');
    try {
      const picked = await pickBackupFile();
      if (!picked) {
        setBusy(null);
        return; // the user cancelled — not an error
      }

      const result = parseBackup(picked.text);
      if (!result.valid) {
        setError(
          `This file cannot be used as a backup.\n\n${result.errors.join('\n')}` +
            (result.warnings.length ? `\n\n${result.warnings.join('\n')}` : '')
        );
        setBusy(null);
        return;
      }

      setPending({ name: picked.name, backup: result.backup, summary: result.summary });
      setMode('replace');
    } catch (err) {
      setError(err?.message ?? 'The file could not be read');
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmRestore = async () => {
    if (!pending) return;
    clearFeedback();
    setBusy('restore');
    try {
      const { store } = await getStore();

      // 1. A safety copy of the CURRENT data, before anything is changed.
      const safety = await createSafetyBackup(store.db, { userId: LOCAL_USER });
      await saveAndShare(
        backupFilename('finance-before-restore'),
        serializeBackup(safety),
        'Safety copy taken before restore'
      );

      // 2. The import, in one transaction.
      const result = await restoreBackup(store.db, pending.backup, {
        mode,
        userId: LOCAL_USER
      });

      setPending(null);

      if (!result.verified) {
        setError(
          'The restore finished but the verification found problems: ' +
            result.verification.problems.join('; ')
        );
        return;
      }

      setMessage(
        `Restore complete — ${describeRestore(result)}. ` +
          'A safety copy of your previous data was exported before the restore.'
      );
    } catch (err) {
      setError(
        (err?.message ?? 'The restore failed') +
          '. Your existing data was not changed — the import runs as a single transaction.'
      );
    } finally {
      setBusy(null);
    }
  };

  const summary = pending?.summary;

  // The local database only exists in the Android build. In the web app the
  // data lives on the server, so this page says so plainly instead of
  // pretending the feature is available.
  if (!isNativeBuild()) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="section-title">Backup &amp; Restore</h1>
          <p className="section-subtitle">Device-local backups</p>
        </div>
        <Card>
          <CardHeader title="Available in the Android app" />
          <CardContent>
            <p className="text-sm text-gray-600">
              Backups are a feature of the Android app, where your financial
              records are stored on the device itself. In the web version your
              records live on the server, which has its own backup and restore
              tooling (see <code>docs/BACKUP_RECOVERY.md</code>).
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="section-title">Backup &amp; Restore</h1>
        <p className="section-subtitle">
          {isNative
            ? 'Your financial data is stored only on this device. Export a backup regularly and keep it somewhere safe.'
            : 'Export a copy of your financial data, or restore one you exported earlier.'}
        </p>
      </div>

      {message && (
        <div
          className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm whitespace-pre-line"
          role="status"
        >
          {message}
        </div>
      )}
      {error && (
        <div
          className="p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700 text-sm whitespace-pre-line"
          role="alert"
        >
          {error}
        </div>
      )}

      <Card>
        <CardHeader
          title="Export a backup"
          subtitle="Creates a JSON file with every account, transaction, budget and goal"
        />
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              The backup contains your data in a documented, versioned format
              (format version 1). It is a plain JSON file, so you can read it,
              keep it in any cloud drive you trust, and restore it on any
              device running this app.
            </p>
            <Button
              variant="primary"
              loading={busy === 'export'}
              disabled={busy !== null}
              onClick={handleExport}
            >
              Export backup
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-danger-200">
        <CardHeader
          title="Restore from a backup"
          subtitle="Replaces the data on this device"
        />
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Choose a backup file. It is checked before anything is changed, and
              you will see exactly what it contains before you confirm. A safety
              copy of your current data is exported first, so a restore can
              always be undone.
            </p>
            <Button
              variant="secondary"
              loading={busy === 'pick'}
              disabled={busy !== null}
              onClick={handlePickFile}
            >
              Choose backup file
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Where is my data?" />
        <CardContent>
          <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5">
            <li>
              {isNative
                ? 'Your records are stored in a SQLite database inside the app\'s private storage on this device.'
                : 'Your records are stored in the app\'s database on the server that runs this app.'}
            </li>
            <li>Nothing is uploaded anywhere automatically.</li>
            <li>
              Android cloud backup and device-to-device transfer are switched
              off for this app, so your data is not copied by the system.
            </li>
            <li>A backup file is the only way to move your data off the device.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Restore preview + confirmation */}
      <Modal
        isOpen={Boolean(pending)}
        onClose={() => setPending(null)}
        title="Restore this backup?"
        size="md"
      >
        {pending && summary && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              <p className="font-medium text-gray-900">{pending.name}</p>
              {summary.exportedAt && (
                <p className="text-gray-600 mt-1">
                  Exported {new Date(summary.exportedAt).toLocaleString()}
                  {summary.appVersion ? ` by version ${summary.appVersion}` : ''}
                </p>
              )}
            </div>

            <div className="text-sm">
              <p className="font-medium text-gray-900 mb-2">This backup contains</p>
              <ul className="space-y-1 text-gray-600 list-disc pl-5">
                {Object.entries(summary.counts)
                  .filter(([, count]) => count > 0)
                  .map(([entity, count]) => (
                    <li key={entity}>
                      {count} {entity}
                    </li>
                  ))}
              </ul>
              {summary.earliestTransaction && (
                <p className="text-gray-500 mt-2">
                  Transactions from {summary.earliestTransaction} to{' '}
                  {summary.latestTransaction}
                </p>
              )}
              <p className="text-gray-500 mt-1">
                Total account balance in the backup:{' '}
                {formatMoney(summary.totalBalance)}
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="label">How should the data be restored?</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="restore-mode"
                  value="replace"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-gray-900">Replace</span>
                  <span className="block text-gray-500">
                    Delete everything currently on this device and use the backup
                    instead. This is the normal choice.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="restore-mode"
                  value="merge"
                  checked={mode === 'merge'}
                  onChange={() => setMode('merge')}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-gray-900">Merge</span>
                  <span className="block text-gray-500">
                    Keep everything on this device and add only the records the
                    backup has and this device does not. Nothing existing is
                    changed.
                  </span>
                </span>
              </label>
            </fieldset>

            <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg text-sm text-warning-800">
              {mode === 'replace'
                ? 'The current data on this device will be deleted. A safety copy is exported first.'
                : 'Records that already exist on this device are left untouched.'}
            </div>

            <div className="flex gap-3">
              <Button variant="danger" loading={busy === 'restore'} onClick={handleConfirmRestore}>
                {mode === 'replace' ? 'Replace my data' : 'Merge this backup'}
              </Button>
              <Button variant="secondary" onClick={() => setPending(null)} disabled={busy !== null}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
