import api, { buildQuery } from './api';
import { isNativeBuild, isNativePlatform } from './platform';
import { localReportApi } from './localApi';
import { getStore, LOCAL_USER } from '../data/runtime.js';
import { saveAndShare } from './fileExport';

/**
 * Report API.
 *
 * WEB: talks to the Express API; CSV/PDF are downloaded as blobs.
 * ANDROID: builds the report from the on-device database and writes the file
 *         into the app's private directory, then offers it through the system
 *         share sheet.
 *
 * The JSON previews are identical on both paths.
 */
const httpReportApi = {
  /** JSON report preview for one of the six report types. */
  async getReport(type, params = {}) {
    const response = await api.get(`/reports/${type}${buildQuery(params)}`);
    return response.data;
  },

  /** Previously generated reports (params only, never content). */
  async getHistory(params = {}) {
    const response = await api.get(`/reports/history${buildQuery(params)}`);
    return response.data;
  },

  /**
   * Download a report as a file. Returns the filename from
   * Content-Disposition (or `fallback` when the header is unavailable).
   */
  async download(type, format, params = {}, fallback = 'report') {
    const response = await api.get(
      `/reports/${type}/export${buildQuery({ ...params, format })}`,
      { responseType: 'blob' }
    );

    const disposition = response.headers['content-disposition'] || '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match ? match[1] : `${fallback}-${format}`;

    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return filename;
  }
};

/**
 * Native report download: build the file on the device and hand it to the
 * user through the system share sheet.
 */
const nativeReportApi = {
  ...localReportApi,

  async download(type, format, params = {}) {
    const { store } = await getStore();

    let filename;
    let data;

    if (format === 'csv') {
      const result = await store.reports.exportCsv(LOCAL_USER, type, params);
      filename = result.filename;
      data = result.text;
    } else if (format === 'pdf') {
      const result = await store.reports.exportPdf(LOCAL_USER, type, params);
      filename = result.filename;
      data = result.bytes;
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }

    await store.reports.recordReportHistory(LOCAL_USER, {
      type,
      format,
      startDate: params.startDate ?? '',
      endDate: params.endDate ?? ''
    });

    await saveAndShare(filename, data, `${type} report`);
    return filename;
  }
};

export const reportApi = isNativeBuild() ? nativeReportApi : httpReportApi;

export { isNativePlatform };
export default reportApi;
