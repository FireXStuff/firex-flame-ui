import _ from 'lodash';
import Vue from 'vue';
import { flextree } from 'd3-flextree';

const BASE_URL = import.meta.env.BASE_URL;

const FIREX_ID_REGEX_STR = 'FireX-.*-(\\d\\d)(\\d\\d)(\\d\\d)-\\d{6}-\\d+';
const FIREX_ID_REGEX = new RegExp(FIREX_ID_REGEX_STR);

const ACCEPT_JSON_HTTP_HEADER = { Accept: 'application/json' };

const TASK_STATE_FAILED = 'task-failed';


function getRoot(tasksByUuid) {
  // TODO: error handling for not exactly 1 root
  return _.filter(_.values(tasksByUuid), task => _.isNull(task.parent_id)
    || !_.has(tasksByUuid, task.parent_id))[0];
}

function flatGraphToTree(tasksByUuid) {
  const root = getRoot(tasksByUuid);
  // TODO: manipulating input is bad.
  // Initialize all nodes as having no children.
  _.values(tasksByUuid).forEach((n) => {
    n.children = [];
  });

  const tasksByParentId = _.mapValues(
    _.groupBy(_.values(tasksByUuid), 'parent_id'),
    children => _.sortBy(children, 'task_num'),
  );
  let uuidsToCheck = [root.uuid];
  while (uuidsToCheck.length > 0) {
    // TODO: guard against loops.
    const curUuid = uuidsToCheck.pop();
    const curTask = tasksByUuid[curUuid];
    if (tasksByParentId[curUuid]) {
      curTask.children = tasksByParentId[curUuid];
    }
    uuidsToCheck = uuidsToCheck.concat(_.map(curTask.children, 'uuid'));
  }
  return root;
}

function isFailed(task) {
  return task.state === TASK_STATE_FAILED;
}

function isChainInterrupted(task) {
  if (!isFailed(task)) {
    return false;
  }
  if (task.exception_cause_uuid) {
    return true;
  }
  // TODO: eventually phase our exception as indicating
  // interrupt exception entirely since it can be big
  // and therefore shouldn't be required.
  if (!task.exception) {
    return false;
  }
  return task.exception.trim().startsWith('ChainInterruptedException');
}

function runStatePredicate(task) {
  return (
    isFailed(task)
    // Show leaf nodes that are chain interrupted exceptions (e.g. RunChildFireX).
    && (!isChainInterrupted(task) || task.isLeaf)
  ) || _.includes(['task-started', 'task-unblocked'], task.state);
}

function createRunStateExpandOperations(runStateByUuid) {
  const showUuidsToUuids = _.pickBy(runStateByUuid, runStatePredicate);
  return _.mapValues(showUuidsToUuids,
    () => [{ targets: ['ancestors', 'self'], operation: 'expand' }]);
}

function calculateNodesPositionByUuid(nodesByUuid) {
  const newRootForLayout = flatGraphToTree(_.cloneDeep(nodesByUuid));
  // This calculates the layout (x, y per node) with dynamic node sizes.
  const verticalSpacing = 50;
  const horizontalSpacing = 0;
  const flextreeLayout = flextree({
    spacing: horizontalSpacing,
    nodeSize: node => [node.data.width, node.data.height + verticalSpacing],
  });
  const laidOutTree = flextreeLayout.hierarchy(newRootForLayout);
  // Modify the input tree, adding x, y, left, top attributes to each node.
  // This is the computed layout.
  flextreeLayout(laidOutTree);

  // The flextreeLayout does some crazy stuff to its input data, where as we only care
  // about a couple fields. Therefore just extract the fields.
  const calcedDimensionsByUuid = {};
  laidOutTree.each((dimensionNode) => {
    calcedDimensionsByUuid[dimensionNode.data.uuid] = {
      x: dimensionNode.left,
      y: dimensionNode.top,
    };
  });
  return calcedDimensionsByUuid;
}

function getCenteringTransform(rectToCenter, container, scaleBounds, verticalPadding) {
  // TODO: padding as percentage of available area.
  const widthToCenter = rectToCenter.right - rectToCenter.left;
  const heightToCenter = rectToCenter.bottom - rectToCenter.top + verticalPadding;
  const xScale = container.width / widthToCenter;
  const yScale = container.height / heightToCenter;
  const scale = _.clamp(_.min([xScale, yScale]), scaleBounds.min, scaleBounds.max);

  const scaledWidthToCenter = widthToCenter * scale;
  let xTranslate = rectToCenter.left * scale;

  // Center based on (scaled) extra horizontal or vertical space.
  if (Math.round(container.width) > Math.round(scaledWidthToCenter)) {
    const remainingHorizontal = container.width - scaledWidthToCenter;
    xTranslate -= remainingHorizontal / 2;
  }

  const scaledHeightToCenter = heightToCenter * scale;
  let yTranslate = (rectToCenter.top - verticalPadding / 2) * scale;
  if (Math.round(container.height) > Math.round(scaledHeightToCenter)) {
    const remainingVertical = container.height - scaledHeightToCenter;
    yTranslate -= remainingVertical / 2;
  }
  return { x: -xTranslate, y: -yTranslate, scale };
}

function isTaskStateIncomplete(state) {
  const incompleteStates = ['task-blocked', 'task-started', 'task-received', 'task-unblocked'];
  return _.includes(incompleteStates, state);
}

function hasIncompleteTasks(nodesByUuid) {
  return _.some(nodesByUuid, n => isTaskStateIncomplete(n.state));
}

function getDescendantUuids(nodeUuid, nodesByUuid) {
  let resultUuids = [];
  const nodesByParentId = _.groupBy(_.values(nodesByUuid), 'parent_id');
  let uuidsToCheck = _.map(nodesByParentId[nodeUuid], 'uuid');
  while (uuidsToCheck.length > 0) {
    resultUuids = resultUuids.concat(uuidsToCheck);
    const allToCheckChildren = _.map(
      uuidsToCheck, c => _.map(_.get(nodesByParentId, c, []), 'uuid'),
    );
    uuidsToCheck = _.flatten(allToCheckChildren);
  }
  return resultUuids;
}

function durationString(duractionSecs) {
  if (!_.isNumber(duractionSecs)) {
    return '';
  }

  const hours = Math.floor(duractionSecs / (60 * 60));
  const hoursInSecs = hours * 60 * 60;
  const mins = Math.floor((duractionSecs - hoursInSecs) / 60);
  const minsInSecs = mins * 60;
  const floatSecs = duractionSecs - hoursInSecs - minsInSecs;
  const secs = Math.floor(floatSecs);

  let result = '';
  if (hours > 0) {
    result += `${hours}h `;
  }
  if (mins > 0) {
    result += `${mins}m `;
  }
  if (secs > 0) {
    result += `${secs}s`;
  }
  if (hours === 0 && mins === 0 && secs === 0) {
    result += `${floatSecs.toFixed(3)}s`;
  }
  return result;
}

function orderByTaskNum(nodesByUuid) {
  return _.mapValues(_.groupBy(_.sortBy(nodesByUuid, 'task_num'), 'uuid'), _.head);
}

/* eslint-disable */
function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  )
}
/* eslint-disable */

const successGreen = '#2A2';
const statusToProps = {
  'task-received': {
    background: '#888',
    priority: 6,
    display: 'Received',
  },
  'task-blocked': {
    background: '#888',
    priority: 7,
    display: 'Blocked',
  },
  'task-started': {
    background: 'cornflowerblue',
    priority: 1,
    display: 'In-Progress',
  },
  'task-succeeded': {
    background: successGreen,
    priority: 9,
    display: 'Success',
  },
  'task-shutdown': {
    background: successGreen,
    priority: 10,
    display: 'Success',
  },
  [[TASK_STATE_FAILED]]: {
    background: '#B00',
    priority: 3,
    display: 'Failed',
  },
  'task-revoked': {
    background: '#F40',
    priority: 4,
    display: 'Revoked',
  },
  'task-revoke-completed': {
    background: '#F40',
    priority: 4,
    display: 'Revoked',
  },
  'task-incomplete': {
    background: 'repeating-linear-gradient(45deg,#888,#888 5px,#444 5px,#444 10px)',
    priority: 5,
    display: 'Incomplete',
  },
  'task-unblocked': {
    background: 'cornflowerblue',
    priority: 2,
    display: 'In-Progress',
  },
};

function getNodeBackground(isChainIntr, state) {
  // A task can fail (have an exception) then succeed on retry,
  // in which case we'ld like to show success.
  if (state === TASK_STATE_FAILED && isChainIntr) {
    return 'repeating-linear-gradient(45deg,#888,#888 5px,#893C3C 5px,#F71818  10px)';
  }
  const defaultColor = '#888';
  return _.get(statusToProps, [state, 'background'], defaultColor);
}

function getPrioritizedTaskStateBackground(states) {
  const minState = _.minBy(states, s =>
    _.get(statusToProps, [s, 'priority'], 1000));
  return getNodeBackground(false, minState);
}

function getRunstateDisplayName(state) {
  return _.get(statusToProps, state, { display: 'Unknown' }).display;
}

function concatArrayMergeCustomizer(objValue, srcValue) {
  if (_.isArray(objValue)) {
    return objValue.concat(srcValue);
  }
}

function containsAll(superset, subset) {
  return _.difference(subset, superset).length === 0;
}

function containsAny(first, second) {
  return _.some(first, x => _.includes(second, x));
}

function getTaskNodeBorderRadius(chain_depth) {
  const isChained = Boolean(chain_depth);
  return !isChained ? '8px' : '';
}

function twoDepthAssign(existingData, newData) {
  const newIncomingKeyData = _.pickBy(newData, (v, k) => !_.has(existingData, k));
  const updateIncomingKeyData = _.pickBy(newData, (v, k) => _.has(existingData, k));

  const result = Object.assign({}, existingData, newIncomingKeyData);
  _.each(updateIncomingKeyData, (updateData, k) => {
    result[k] = Object.assign({}, existingData[k], updateData);
  });
  return result;
}

const DEFAULT_UI_CONFIG = {
  /*
   * Allowed values: webserver-file, socketio-param, socketio-origin
   */
  access_mode: 'socketio-origin',
  model_path_template: null,
  is_central: false,
  central_server: null,
  central_server_ui_path: null,
  central_documentation_url: null,
  firex_bin: 'firex',
  rel_completion_report_path: null,
  logs_serving: {
  /*
   * Allowed values:
   *  central-webserver: prepends the 'central_webserver' to log paths. Assumes the central
   *    webserver supports listing directories.
   *
   *  local-webserver: path-only links to the same webserver serving the UI. Assumes
   *    the webserver serving the UI supports listing directories.
   *
   *  google-cloud-storage: fetches logs and directory (object) listings from the URL
   *    format specified by 'url_format'. Directories are expected to be in google storage
   *    format: https://cloud.google.com/storage/docs/listing-objects.
   */
    serve_mode: 'central-webserver',
    /*
     * supports firex_id in lodash templating format, for example:
     *  https://www.googleapis.com/storage/v1/b/some_bucket/o?prefix=runs/<%- firex_id %>
     */
    url_format: null, // only needed for 'google-cloud-storage' mode.
  }
};

function isRequiredAccessModeDataPresent(accessMode, route) {
  if (accessMode === 'socketio-origin') {
    // Always have origin, no data needed from route.
    return true;
  }
  if (accessMode === 'webserver-file' && !_.isNil(route.params.inputFireXId)) {
    return true;
  }
  if (accessMode === 'socketio-param' && !_.isNil(route.query.flameServer)) {
    return true;
  }
  return false;
}

function supportsFindView(accessMode) {
  return accessMode === 'webserver-file';
}

function fetchUiConfig() {
  const sep = BASE_URL.endsWith('/') ? '' : '/';
  return fetch(`${BASE_URL}${sep}flame-ui-config.json`, { headers: ACCEPT_JSON_HTTP_HEADER })
    .then((r) => {
        if (r.ok) {
          return r.json();
        }
        return DEFAULT_UI_CONFIG;
      },
      () => DEFAULT_UI_CONFIG)
    .catch(() => DEFAULT_UI_CONFIG);
}

function fetchRunModelMetadata(firexId, modelPathTemplate) {
  if (!isFireXIdValid(firexId)) {
    return new Promise((u, reject) => reject());
  }
  return fetchWithRetry(templateFireXId(modelPathTemplate, firexId), 7,
    { cache: "no-cache", mode: 'cors', headers: ACCEPT_JSON_HTTP_HEADER })
    .then(r => {
      if (!r.ok) {
        return Promise.reject(r);
      }
      return r.json()
    });
}

function fetchRunJson(firexId, modelPathTemplate) {
  if (!isFireXIdValid(firexId)) {
    return new Promise((u, reject) => reject());
  }
  const flameModelPath = templateFireXId(modelPathTemplate, firexId);
  // hack
  const pathParts = _.split(flameModelPath, '/').slice(0, -2);
  const runJsonPath = _.join(_.concat(pathParts.slice(0, -2), 'run.json'), '/');
  return fetchWithRetry(runJsonPath, 7,
    { cache: "no-cache", mode: 'cors', headers: ACCEPT_JSON_HTTP_HEADER })
    .then(r => {
      if (!r.ok) {
        return Promise.reject(r);
      }
      return r.json()
    });
}

function tasksViewKeyRouteChange(to, from, next, setUiConfigFn) {
  fetchUiConfig().then(uiConfig => {
    if (isRequiredAccessModeDataPresent(uiConfig.access_mode, to)) {
      next(vm => setUiConfigFn(vm, uiConfig));
    } else {
      // Missing key required to show task data -- send to find view if supported.
      if (supportsFindView(uiConfig.access_mode)) {
        next('/find');
      } else {
        next(errorRoute(`Can't show tasks for access mode '${uiConfig.access_mode}'.`));
      }
    }
  });
}

function errorRoute(message) {
  console.error(message);
  return { name: 'error', query: { message } };
}

function findRunPathSuffix(path) {
  const pathFireXIdRegex = new RegExp(`^#?/.*${FIREX_ID_REGEX_STR}`);
  if (pathFireXIdRegex.test(path)) {
    return _.replace(path, pathFireXIdRegex, '')
  }
  return '/';
}

function templateFireXId(template, firexId, extraTemplateArgs) {
  if (!extraTemplateArgs) {
    extraTemplateArgs = {};
  }
  const firexIdParts = getFireXIdParts(firexId);
  const templateOptions = { evaluate: null, interpolate: null };
  const templateArgs = _.assign({}, firexIdParts, extraTemplateArgs)
  return _.template(template, templateOptions)(templateArgs);
}

function isFireXIdValid(firexId) {
  return FIREX_ID_REGEX.test(firexId)
}

function findFireXId(text) {
  const match = text.match(FIREX_ID_REGEX);
  if (!_.isEmpty(match)) {
    return match[0];
  }
  return match;
}

function getFireXIdParts(firexId) {
  if (!isFireXIdValid(firexId)) {
    throw Error(`Invalid firex_id can't have parts extracted: ${firexId}`);
  }
  const match = FIREX_ID_REGEX.exec(firexId);
  return {
    'year': match[1],
    'month': match[2],
    'day': match[3],
    'firex_id': firexId,
  };
}


function fetchWithRetry(url, maxRetries, fetchOptions) {
  const delay = 1000;
  return new Promise((resolve, reject) => {
    let attemptCount = 0;
    const fetchRetry = (url, n) => {
      const delayedRetry = () => setTimeout(() => {
            attemptCount++
            fetchRetry(url, n - 1);
          }, attemptCount * delay);

      return fetch(url, fetchOptions).then(r => {
        if (!r.ok && n !== 1) {
          delayedRetry();
        } else {
          resolve(r);
        }
      }).catch(function (error) {
        if (n === 1) {
          reject(error);
        }
        else {
          delayedRetry();
        }
      });
    }
    return fetchRetry(url, maxRetries);
  });
}

function createLinkifyRegex(additionalPrefixes) {
  const escapedConfigPrefixes = _.map(additionalPrefixes, _.escapeRegExp);

  const linkifyPrefixes = _.concat('https?:\\/\\/', escapedConfigPrefixes);
  const linkifyPrefix = _.join(linkifyPrefixes, '|');
  const LINKIFY_END_REGEX = '(?=[\\s,\']|&(quot|lt|gt|#39);|$)';

  return RegExp(`((${linkifyPrefix}).+?${LINKIFY_END_REGEX})`, 'g');
}

function createLinkedHtml(text, regex, linkClass) {
  const replacements = []
  if (!linkClass) {
    linkClass = 'subtle-link'
  }

  const intermediate = _.escape(text).replace(regex, function (match) {
      const replacementId = replacements.length;
      replacements.push(`<a href="${match}" class="${linkClass}">${match}</a>`);
      return `SPECIAL%%%REPLACE${replacementId}`;
    });

  return intermediate.replace(/SPECIAL%%%REPLACE(\d+)/g,
    function (specialReplace, id) {
    return replacements[parseInt(id)];
  });
}

function normalizeGoogleBucketItems(googleBucketItems, firexId) {
  return _.map(googleBucketItems, (item) => {
    // Assume logs path always has FireX ID marking root of logs dir.
    const path = _.trimStart(_.last(_.split(item.name, firexId, 2)), '/');

    return {
      id: item.id,
      path,
      name: _.last(pathStringToArray(path)),
      // FIXME: The only links on item are to metadata and download, but we want to
      // in-browser view. There must be a better way, but hardcode the
      // base google cloud storage URL.
      link: `https://storage.cloud.google.com/${item.bucket}/${item.name}`,
      parentDir: getParentArray(path),
    };
  });
}

function pathStringToArray(path) {
  return _.filter(_.split(path, '/'));
}

function getParentArray(path) {
  const pathArray = _.isString(path) ? pathStringToArray(path) : path;
  return _.initial(pathArray);
}

function arrayToPath(path) {
  return _.join(path, '/');
}

// See https://vuejs.org/v2/guide/migration.html#dispatch-and-broadcast-replaced
const eventHub = new Vue();
const isDebug = process.env.NODE_ENV !== 'production';

export {
  eventHub,
  calculateNodesPositionByUuid,
  getCenteringTransform,
  isTaskStateIncomplete,
  hasIncompleteTasks,
  isChainInterrupted,
  getDescendantUuids,
  durationString,
  orderByTaskNum,
  uuidv4,
  getNodeBackground,
  getPrioritizedTaskStateBackground,
  getRunstateDisplayName,
  createRunStateExpandOperations,
  concatArrayMergeCustomizer,
  containsAll,
  containsAny,
  getTaskNodeBorderRadius,
  twoDepthAssign,
  isFireXIdValid,
  getFireXIdParts,
  tasksViewKeyRouteChange,
  fetchUiConfig,
  templateFireXId,
  fetchRunModelMetadata,
  fetchRunJson,
  findRunPathSuffix,
  errorRoute,
  createLinkifyRegex,
  createLinkedHtml,
  findFireXId,
  normalizeGoogleBucketItems,
  arrayToPath,
  pathStringToArray,
  getParentArray,
  isDebug,
  ACCEPT_JSON_HTTP_HEADER,
  BASE_URL,
};
