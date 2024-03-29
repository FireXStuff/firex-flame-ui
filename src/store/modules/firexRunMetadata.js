import _ from 'lodash';

const metaDataState = {
  uid: null,
  logs_dir: null,
  root_uuid: null,
  chain: null,
  logs_server: null,
  flame_url: null,
  run_complete: null,
  revoke_reason: null,
  revoke_timestamp: null,
};

// getters
const getters = {};

// actions
const actions = {
  setFlameRunMetadata(context, firexRunMetadata) {
    context.dispatch('tasks/clearTaskNodeSize');
    context.dispatch('graph/enableLiveUpdate', null, { root: true });
    context.commit('setFlameRunMetadata', firexRunMetadata);
  },
};

// mutations
const mutations = {
  setFlameRunMetadata(state, firexRunMetadata) {
    _.each(_.keys(metaDataState), (k) => {
      state[k] = _.get(firexRunMetadata, k, null);
    });
  },
};

export default {
  namespaced: true,
  state: metaDataState,
  getters,
  actions,
  mutations,
};
