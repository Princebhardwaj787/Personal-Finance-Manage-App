import api, { buildQuery } from './api';

/**
 * Report API (Phase 8).
 *
 * JSON previews go through the normal axios instance. CSV/PDF downloads need
 * `responseType: 'blob'` because the token lives in localStorage — a plain
 * `<a href>` cannot send the Authorization header, so the file is fetched as
 * a blob and saved via an object URL.
 */
export const reportApi = {
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
