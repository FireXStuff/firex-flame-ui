// TODO: why isn't lodash found when running from pycharm?
// import _ from 'lodash';
import { mount, createLocalVue } from '@vue/test-utils';
import VueRouter from 'vue-router';

import XGraph from '@/components/XGraph.vue';

const localVue = createLocalVue();
localVue.use(VueRouter);
const router = new VueRouter();

const simpleNodesByUuid = {
  1: { uuid: '1', name: 'rootName', children_uuids: [] },
};
// _.keyBy([
//   { uuid: '1', name: 'rootName' },
// ], 'uuid');

describe('XGraph.vue', () => {
  it('renders simple tree', () => {
    const msg = 'new message';
    const wrapper = mount(XGraph, {
      propsData: {
        nodesByUuid: simpleNodesByUuid,
        firexUid: 'FireX-user-xxxxx',
        liveUpdate: false,
      },
      localVue,
      router,
    });
    console.log(wrapper.html());
    // expect(wrapper.text()).toMatch(msg);
  });
});
