import _ from 'lodash';

import {
  orderByTaskNum, hasIncompleteTasks, getDescendantUuids, twoDepthAssign, containsAny,
} from '../../utils';

const tasksState = {
  // Main task data structure.
  allTasksByUuid: {},
  selectedRoot: null,
  // TODO: this shouldn't be stored globally, but rather fetched by the attribute viewing
  // component. This requires API operations to be externalized from XParent.
  detailedTask: {},
  socketConnected: false,
  // unfortunately we need to track this manually. TODO: look for a better way.
  taskNodeSizeByUuid: {},

  search: {
    term: '',
    selectedIndex: 0,
    resultUuids: [],
    isOpen: false,
  },
  // When set, fades-out other nodes. Is reset by pan/zoom events.
  focusedTaskUuid: null,
};

// getters
const tasksGetters = {

  tasksByUuid(state, getters) {
    if (_.isNull(state.selectedRoot) || !_.has(state.allTasksByUuid, state.selectedRoot)) {
      return state.allTasksByUuid;
    }
    return getters.descendantTasksByUuid(state.selectedRoot);
  },

  // TODO: could split this in to selected visible (via root) & literally all in order to
  //  cache layouts for all.
  allTaskUuids: (state, getters) => _.keys(getters.tasksByUuid),

  runStateByUuid: (state, getters, rootState, rootGetters) => _.mapValues(
    // note nodesByUuid can be updated before childrenUuidsByUuid, so add default.
    state.allTasksByUuid,
    n => _.assign(
      { isLeaf: _.get(rootGetters['graph/childrenUuidsByUuid'], n.uuid, []).length === 0 },
      _.pick(n, ['state', 'exception']),
    ),
  ),

  // TODO: further prune to flame_data._default_display
  flameDataAndNameByUuid: state => _.mapValues(state.allTasksByUuid,
    n => _.pick(n, ['flame_data', 'name', 'parent_id', 'uuid'])),

  chainsByUuid: state => _.mapValues(
    _.pickBy(state.allTasksByUuid, t => t.chain_depth > 0),
    t => _.pick(t, 'prev_chain_entry', 'chain_depth'),
  ),

  descendantTasksByUuid: state => (rootUuid) => {
    const descUuids = getDescendantUuids(rootUuid, state.allTasksByUuid);
    return orderByTaskNum(_.pick(state.allTasksByUuid, [rootUuid].concat(descUuids)));
  },

  // TODO: add support for custom root.
  hasIncompleteTasks: state => hasIncompleteTasks(state.allTasksByUuid),

  hasTasks: state => !_.isEmpty(state.allTasksByUuid),

  rootUuid: (state, getters, rootState) => {
    if (!_.isNil(state.selectedRoot)) {
      return state.selectedRoot;
    }
    if (!_.isNil(rootState.firexRunMetadata.root_uuid)) {
      return rootState.firexRunMetadata.root_uuid;
    }
    // Fallback to searching graph.
    const nullParents = _.filter(state.allTasksByUuid, { parent_id: null });
    return _.isEmpty(nullParents) ? null : _.head(nullParents).uuid;
  },

  canRevoke: (state, getters) => getters.hasIncompleteTasks && state.socketConnected,

  searchForUuids: state => (searchTerm) => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    const searchFields = ['name', 'hostname', 'flame_additional_data', 'uuid'];
    // TODO add support for flame_data (html entries only).
    return _.keys(_.pickBy(state.allTasksByUuid,
      t => _.some(_.pick(t, searchFields),
        attr => _.includes(attr.toLowerCase(), lowerSearchTerm))));
  },

};

// actions
const actions = {
  setDetailedTask(context, detailedTask) {
    const childrenUuids = context.rootGetters['graph/childrenUuidsByUuid'][detailedTask.uuid];
    const children = _.map(childrenUuids,
      uuid => ({ uuid, name: context.state.allTasksByUuid[uuid].name }));

    let parent;
    if (!_.isNil(detailedTask.parent_id)) {
      parent = {
        uuid: detailedTask.parent_id,
        name: context.state.allTasksByUuid[detailedTask.parent_id].name,
      };
    } else {
      parent = {};
    }
    context.commit('setDetailedTask', _.assign({ children, parent }, detailedTask));
  },

  setTasks(context, tasksByUuid) {
    context.commit('setTasks', tasksByUuid);
  },

  addTasksData(context, newDataByUuid) {
    // TODO: do other incremental updating (e.g. of graph structure, collapse data, etc) here
    // instead of doing a full re-calc every time a node is added.
    context.commit('addTasksData', newDataByUuid);
  },

  clearTaskData(context) {
    context.commit('setTasks', {});
    context.commit('clearTaskNodeSize');
    context.commit('setDetailedTask', {});
  },

  addTaskNodeSize(context, taskNodeSize) {
    context.commit('addTaskNodeSize', taskNodeSize);
  },

  selectRootUuid(context, newRootUuid) {
    context.commit('selectRootUuid', newRootUuid);
  },

  search(context, searchSubmission) {
    if (searchSubmission.term !== context.state.search.term) {
      // New search term, submit new search.
      let resultUuids = context.getters.searchForUuids(searchSubmission.term);
      if (searchSubmission.findUncollapsedAncestor) {
        // Find uncollapsed tasks that contain collapsed search results.
        const collapsedUuids = context.rootGetters['graph/collapsedNodeUuids'];
        const collapsedSearchResultUuids = _.intersection(resultUuids, collapsedUuids);
        const uncollapsedGraphByNodeUuid = context.getters['graph/uncollapsedGraphByNodeUuid'];
        const uncollapsedContainingResultUuids = _.keys(_.pickBy(uncollapsedGraphByNodeUuid,
          collapseDetails => containsAny(
            collapseDetails.collapsedUuids, collapsedSearchResultUuids,
          )));
        const uncollapsedSearchResultUuids = _.difference(resultUuids, collapsedUuids);
        const uncollapsedResultsAndCollapsedContaining = _.concat(uncollapsedContainingResultUuids,
          uncollapsedSearchResultUuids);
        // use all UUIDs intersection to maintain task_num order.
        resultUuids = _.intersection(context.getters.allTaskUuids,
          uncollapsedResultsAndCollapsedContaining);
      }
      context.commit('setTaskSearchResults',
        { term: searchSubmission.term, results: resultUuids });
    } else if (context.state.search.resultUuids.length > 0) {
      // Same search term as before, go from current result to the next.
      const resultCount = context.state.search.resultUuids.length;
      const nextIndex = (context.state.search.selectedIndex + 1) % resultCount;
      context.commit('setSearchIndex', nextIndex);
    }
  },

  previousSearchResult(context) {
    const resultCount = context.state.search.resultUuids.length;
    if (resultCount > 0) {
      const nextIndex = (context.state.search.selectedIndex - 1 + resultCount) % resultCount;
      context.commit('setSearchIndex', nextIndex);
    }
  },

};

function findChainRootUuid(tasksByUuid, uuid) {
  let taskToCheck = tasksByUuid[uuid];
  while (taskToCheck) {
    if (taskToCheck.chain_depth === 0) {
      return taskToCheck.uuid;
    }
    const parentTask = tasksByUuid[taskToCheck.parent_id];
    if (taskToCheck.chain_depth === 1) {
      // If a task has chain depth of 1, that means the previous task in the chain (it's parent)
      // is the first task in the chain, and therefore it's grandparent is the root of the chain.
      return parentTask.parent_id;
    }
    taskToCheck = parentTask;
  }
  return null;
}

function addChainFields(tasksByUuid) {
  return _.mapValues(tasksByUuid, (t) => {
    if (t.chain_depth > 0 && !_.includes(_.keys(t), 'prev_chain_entry')) {
      const prevChainEntry = t.parent_id;
      const chainRootUuid = findChainRootUuid(tasksByUuid, t.uuid);
      return Object.assign({}, t,
        { parent_id: chainRootUuid, prev_chain_entry: prevChainEntry });
    }
    return t;
  });
}

// mutations
const mutations = {

  // Avoid Vue dependency tracking by freezing tasksByUuid. This causes issues for large graphs.

  addTasksData(state, newDataByUuid) {
    state.allTasksByUuid = Object.freeze(
      // TODO: chain fields should likely be added elsewhere.
      addChainFields(twoDepthAssign(state.allTasksByUuid, newDataByUuid)),
    );
  },

  setTasks(state, tasksByUuid) {
    // TODO: chain fields should likely be added elsewhere.
    state.allTasksByUuid = Object.freeze(addChainFields(tasksByUuid));
  },

  setDetailedTask(state, detailedTask) {
    state.detailedTask = detailedTask;
  },

  setSocketConnected(state, newSocketConnected) {
    state.socketConnected = newSocketConnected;
  },

  addTaskNodeSize(state, taskNodeSizeByUuid) {
    state.taskNodeSizeByUuid = Object.freeze(
      _.assign({}, state.taskNodeSizeByUuid, taskNodeSizeByUuid),
    );
  },

  clearTaskNodeSize(state) {
    state.taskNodeSizeByUuid = {};
  },

  selectRootUuid(state, newRootUuid) {
    state.selectedRoot = newRootUuid;
  },

  setFocusedTaskUuid(state, newFocusedTaskUuid) {
    state.focusedTaskUuid = newFocusedTaskUuid;
  },

  setTaskSearchResults(state, newSearch) {
    state.search = {
      term: newSearch.term,
      selectedIndex: 0,
      resultUuids: newSearch.results,
      isOpen: true,
    };
    if (newSearch.results.length > 0) {
      state.focusedTaskUuid = state.search.resultUuids[state.search.selectedIndex];
    }
  },

  setSearchIndex(state, newIndex) {
    state.search.selectedIndex = newIndex;
    state.focusedTaskUuid = state.search.resultUuids[newIndex];
  },

  closeSearch(state) {
    state.search.isOpen = false;
    state.focusedTaskUuid = null;
  },

  toggleSearchOpen(state) {
    state.search.isOpen = !state.search.isOpen;
  },

};

export default {
  namespaced: true,
  state: tasksState,
  getters: tasksGetters,
  actions,
  mutations,
};
