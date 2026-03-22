import 'solid-js';

type MduiEventMap = {
  'on:change'?: (e: any) => void;
  'on:input'?: (e: any) => void;
  'on:close'?: (e: Event) => void;
  'on:open'?: (e: Event) => void;
  'on:confirm'?: (e: Event) => void;
  'on:cancel'?: (e: Event) => void;
  'on:click'?: (e: MouseEvent) => void;
  'on:contextmenu'?: (e: MouseEvent) => void;
  'on:clear'?: (e: Event) => void;
  'on:submit'?: (e: Event) => void;
};

type MduiBaseProps = {
  class?: string;
  style?: string | Record<string, string>;
  ref?: ((el: HTMLElement) => void) | HTMLElement;
  children?: any;
  id?: string;
  slot?: string;
  title?: string;
  target?: string;
} & MduiEventMap;

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'mdui-button': MduiBaseProps & {
        variant?: 'elevated' | 'filled' | 'tonal' | 'outlined' | 'text';
        icon?: string;
        'end-icon'?: string;
        href?: string;
        disabled?: boolean;
        loading?: boolean;
        type?: 'button' | 'submit' | 'reset';
        'full-width'?: boolean;
      };
      'mdui-icon': MduiBaseProps & {
        name?: string;
        src?: string;
      };
      'mdui-button-icon': MduiBaseProps & {
        variant?: 'standard' | 'filled' | 'tonal' | 'outlined';
        icon?: string;
        href?: string;
        disabled?: boolean;
        loading?: boolean;
        selected?: boolean;
        'selected-icon'?: string;
      };
      'mdui-fab': MduiBaseProps & {
        variant?: 'primary' | 'surface' | 'secondary' | 'tertiary';
        size?: 'normal' | 'small' | 'large';
        icon?: string;
        extended?: boolean;
        lowered?: boolean;
      };
      'mdui-navigation-bar': MduiBaseProps & {
        value?: string;
        'label-visibility'?: 'selected' | 'labeled' | 'unlabeled';
        'on:change'?: (e: CustomEvent<{ value: string }>) => void;
      };
      'mdui-navigation-bar-item': MduiBaseProps & {
        value?: string;
        icon?: string;
        'active-icon'?: string;
        label?: string;
        href?: string;
        badge?: string;
      };
      'mdui-navigation-rail': MduiBaseProps & {
        value?: string;
        alignment?: 'start' | 'center' | 'end';
        contained?: boolean;
        divider?: boolean;
        'on:change'?: (e: CustomEvent<{ value: string }>) => void;
      };
      'mdui-navigation-rail-item': MduiBaseProps & {
        value?: string;
        icon?: string;
        'active-icon'?: string;
        label?: string;
        href?: string;
      };
      'mdui-card': MduiBaseProps & {
        variant?: 'elevated' | 'filled' | 'outlined';
        clickable?: boolean;
        disabled?: boolean;
        href?: string;
      };
      'mdui-text-field': MduiBaseProps & {
        variant?: 'filled' | 'outlined';
        type?: string;
        name?: string;
        value?: string;
        label?: string;
        placeholder?: string;
        icon?: string;
        'end-icon'?: string;
        readonly?: boolean;
        disabled?: boolean;
        clearable?: boolean;
        rows?: number;
        maxlength?: number;
        'helper-text'?: string;
        helper?: string;
      };
      'mdui-chip': MduiBaseProps & {
        variant?: 'assist' | 'filter' | 'input' | 'suggestion';
        elevated?: boolean;
        selected?: boolean;
        icon?: string;
        'selected-icon'?: string;
        'end-icon'?: string;
        disabled?: boolean;
        selectable?: boolean;
      };
      'mdui-switch': MduiBaseProps & {
        checked?: boolean;
        disabled?: boolean;
        'checked-icon'?: string;
        'unchecked-icon'?: string;
        'on:change'?: (e: CustomEvent) => void;
      };
      'mdui-slider': MduiBaseProps & {
        value?: number;
        min?: number;
        max?: number;
        step?: number;
        disabled?: boolean;
        tickmarks?: boolean;
        nolabel?: boolean;
        'label-formatter'?: string;
        'on:change'?: (e: CustomEvent) => void;
        'on:input'?: (e: CustomEvent) => void;
      };
      'mdui-dialog': MduiBaseProps & {
        open?: boolean;
        headline?: string;
        description?: string;
        icon?: string;
        'close-on-esc'?: boolean;
        'close-on-overlay-click'?: boolean;
        'stacked-actions'?: boolean;
        'on:open'?: (e: Event) => void;
        'on:close'?: (e: Event) => void;
      };
      'mdui-menu': MduiBaseProps & {
        open?: boolean;
        trigger?: string;
      };
      'mdui-menu-item': MduiBaseProps & {
        value?: string;
        icon?: string;
        'end-icon'?: string;
        'end-text'?: string;
        disabled?: boolean;
        href?: string;
      };
      'mdui-list': MduiBaseProps & {};
      'mdui-list-item': MduiBaseProps & {
        headline?: string;
        description?: string;
        icon?: string;
        'end-icon'?: string;
        alignment?: 'start' | 'center' | 'end';
        disabled?: boolean;
        active?: boolean;
        nonclickable?: boolean;
        rounded?: boolean;
        href?: string;
      };
      'mdui-list-subheader': MduiBaseProps & {};
      'mdui-divider': MduiBaseProps & {
        middle?: boolean;
        inset?: boolean;
      };
      'mdui-top-app-bar': MduiBaseProps & {
        variant?: 'center-aligned' | 'small' | 'medium' | 'large';
        'scroll-behavior'?: string;
        'scroll-target'?: string;
      };
      'mdui-top-app-bar-title': MduiBaseProps & {};
      'mdui-navigation-drawer': MduiBaseProps & {
        open?: boolean;
        modal?: boolean;
        'close-on-esc'?: boolean;
        'close-on-overlay-click'?: boolean;
        contained?: boolean;
        placement?: 'left' | 'right';
        'on:open'?: (e: Event) => void;
        'on:close'?: (e: Event) => void;
      };
      'mdui-snackbar': MduiBaseProps & {
        open?: boolean;
        placement?: 'top' | 'top-start' | 'top-end' | 'bottom' | 'bottom-start' | 'bottom-end';
        'close-on-outside-click'?: boolean;
        'message-line'?: '1' | '2';
        'auto-close-delay'?: number;
        action?: string;
      };
      'mdui-circular-progress': MduiBaseProps & {
        value?: number;
        max?: number;
      };
      'mdui-linear-progress': MduiBaseProps & {
        value?: number;
        max?: number;
      };
      'mdui-collapse': MduiBaseProps & {
        accordion?: boolean;
        value?: string | string[];
      };
      'mdui-collapse-item': MduiBaseProps & {
        value?: string;
        header?: string;
        disabled?: boolean;
      };
      'mdui-tooltip': MduiBaseProps & {
        content?: string;
        placement?: string;
        trigger?: string;
        delay?: number;
      };
      'mdui-dropdown': MduiBaseProps & {
        open?: boolean;
        trigger?: 'click' | 'hover' | 'focus' | 'contextmenu' | 'manual';
        placement?: string;
        disabled?: boolean;
        'stay-open-on-click'?: boolean;
        'on:open'?: (e: Event) => void;
        'on:close'?: (e: Event) => void;
      };
      'mdui-select': MduiBaseProps & {
        value?: string;
        name?: string;
        variant?: 'filled' | 'outlined';
        label?: string;
        placeholder?: string;
        multiple?: boolean;
        disabled?: boolean;
        clearable?: boolean;
        'on:change'?: (e: CustomEvent) => void;
      };
      'mdui-select-option': MduiBaseProps & {
        // actually mdui-menu-item is used in select
        value?: string;
        disabled?: boolean;
      };
      'mdui-radio-group': MduiBaseProps & {
        value?: string;
        'on:change'?: (e: CustomEvent) => void;
      };
      'mdui-radio': MduiBaseProps & {
        value?: string;
        disabled?: boolean;
        checked?: boolean;
      };
      'mdui-checkbox': MduiBaseProps & {
        checked?: boolean;
        disabled?: boolean;
        indeterminate?: boolean;
        'on:change'?: (e: CustomEvent) => void;
      };
      'mdui-segmented-button-group': MduiBaseProps & {
        value?: string;
        'full-width'?: boolean;
        selects?: 'single' | 'multiple';
        'on:change'?: (e: CustomEvent) => void;
      };
      'mdui-segmented-button': MduiBaseProps & {
        value?: string;
        icon?: string;
        'end-icon'?: string;
        disabled?: boolean;
      };
      'mdui-tabs': MduiBaseProps & {
        value?: string;
        variant?: 'primary' | 'secondary';
        placement?:
          | 'top-start'
          | 'top'
          | 'top-end'
          | 'bottom-start'
          | 'bottom'
          | 'bottom-end'
          | 'left-start'
          | 'left'
          | 'left-end'
          | 'right-start'
          | 'right'
          | 'right-end';
        'full-width'?: boolean;
        'on:change'?: (e: CustomEvent) => void;
      };
      'mdui-tab': MduiBaseProps & {
        value?: string;
        icon?: string;
        inline?: boolean;
      };
      'mdui-tab-panel': MduiBaseProps & {
        value?: string;
      };
      'mdui-badge': MduiBaseProps & {
        variant?: 'small' | 'large';
      };
      'mdui-avatar': MduiBaseProps & {
        src?: string;
        icon?: string;
        label?: string;
        fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
      };
      'mdui-bottom-app-bar': MduiBaseProps & {
        'scroll-behavior'?: string;
        'scroll-target'?: string;
        'fab-detach'?: boolean;
      };
      'mdui-layout': MduiBaseProps & {
        'full-height'?: boolean;
      };
      'mdui-layout-item': MduiBaseProps & {
        placement?: 'top' | 'bottom' | 'left' | 'right';
        order?: number;
      };
      'mdui-layout-main': MduiBaseProps & {};
    }
  }
}
