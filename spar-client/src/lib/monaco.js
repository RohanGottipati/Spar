import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

let isConfigured = false;

export function configureMonaco() {
  if (isConfigured) {
    return;
  }

  const existingEnvironment = globalThis.MonacoEnvironment || {};

  globalThis.MonacoEnvironment = {
    ...existingEnvironment,
    getWorker(moduleId, label) {
      if (label === 'json') {
        return new jsonWorker();
      }

      if (label === 'css' || label === 'scss' || label === 'less') {
        return new cssWorker();
      }

      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new htmlWorker();
      }

      if (label === 'typescript' || label === 'javascript') {
        return new tsWorker();
      }

      if (typeof existingEnvironment.getWorker === 'function') {
        return existingEnvironment.getWorker(moduleId, label);
      }

      return new editorWorker();
    },
  };

  loader.config({ monaco });
  isConfigured = true;
}
