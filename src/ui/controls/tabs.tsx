import type { ReactNode } from 'react';
import { Tabs as Base } from '@base-ui/react/tabs';
import './controls.css';

interface Tab { value: string; label: ReactNode; panel: ReactNode }

/** 标签页，默认选中第一页；当前页只是界面状态，不回写外观。 */
export function Tabs({ label, tabs }: { label: string; tabs: readonly [Tab, ...Tab[]] }) {
  return (
    <Base.Root className="ctl-tabs" defaultValue={tabs[0].value}>
      <Base.List className="ctl-tab-list" aria-label={label}>
        {tabs.map((tab) => <Base.Tab key={tab.value} value={tab.value} className="ctl-tab">{tab.label}</Base.Tab>)}
      </Base.List>
      {tabs.map((tab) => <Base.Panel key={tab.value} value={tab.value} className="ctl-tab-panel">{tab.panel}</Base.Panel>)}
    </Base.Root>
  );
}
