/**
 * ListView 在 TreeView 的应用场景下，ListItem 有以下鼠标事件：
 * - 单击
 * - 双击
 * - 右击
 * - 滚动
 *
 * 有以下键盘事件：
 * - 上/下：active 项向上滚动
 * - 左/右：关闭/打开文件夹，active 移出/移入
 * - 空格：选中（同单击）
 * - 回车：重命名
 *
 * 打开文件夹，则该文件夹后面的内容将重新渲染，涉及到以下部分：
 * - 文件夹/文件图标切换
 * - 指示图标切换
 * - 缩进线
 * - 文件夹/文件标题
 *
 * ListView 在通用的应用场景下，ListItem 提供以下方法：
 * - insertData(data, index)：增量添加数据，适合懒加载
 * - deleteData(index, count)：删除数据，返回被删除内容
 * - updateData(data)：全量更新数据，但只渲染视口内数据，成本较低
 * - doResize()：手动更新容器尺寸
 */

import EventBus from "../EventBus";
import { Scrollbar } from "../Scrollbar";

/**
 * @var 为实现平滑滚动而补足的数据项数量
 */
const DSURPLUS_COUNT = 0;
const RUNWAY_COUNT = 1;

export interface IListViewOptions<T> {
  /**
   * @member 容器的标签
   */
  tagName: keyof HTMLElementTagNameMap;
  /**
   * @member 自定义容器的类名
   */
  className: string;
  /**
   * @member 滚动条是否可隐藏
   */
  suppressible: boolean;
  /**
   * @member 数据项高度
   */
  itemHeight: number;
  /**
   * @member 容器宽度是否固定
   */
  fixedSize: boolean;

  /* 以下为回调函数 */

  /**
   * @member 节点创建函数
   */
  createHandler(): HTMLElement;
  /**
   * @member 节点渲染函数
   * @param node DOM 节点
   * @param data 数据
   * @param index 数据的逻辑索引
   */
  renderHandler(node: HTMLElement, data: T, index: number, ...args: any[]): void;
}

export type EventType = "click" | "dbclick" | "contextmenu";

export class ListView<T> extends EventBus<EventType> {
  /**
   * @description 挂载的节点
   */
  private readonly root!: HTMLElement;

  /**
   * @description 容器的节点
   */
  private readonly container!: HTMLElement;

  /**
   * @description 撑开容器的元素
   */
  private readonly runway!: HTMLDivElement;

  /**
   * @description 滚动条
   */
  private readonly scrollbar!: Scrollbar;

  /**
   * @description  缓存尺寸以减少 DOM 渲染
   */
  private readonly cachedValue = {
    /**
     * @description 占位区块的高
     */
    runwayHeight: 0,
    /**
     * @description 占位区块的宽
     */
    runwayWidth: 0,
    /**
     * @description 滚动条宽度
     */
    scrollbarWidth: 0,
    /**
     * @description 高度
     */
    virtualContainerHeight: 0,
  };

  /**
   * @description 实际数据
   */
  private sourceList: Array<T> = [];

  /**
   * @description 视口待展示的数据量
   */
  private get virtualItemCount() {
    const { clientHeight } = this.container;
    this.cachedValue.virtualContainerHeight = clientHeight;
    return Math.ceil(clientHeight / this.options.itemHeight) + DSURPLUS_COUNT;
  }

  /**
   * @description 内容的实际高度
   */
  private get actualContainerHeight() {
    return this.sourceList.length * this.options.itemHeight;
  }

  /**
   * @description 配置项
   */
  private options!: IListViewOptions<T>;

  constructor(root: HTMLElement, options?: Partial<IListViewOptions<T>>) {
    super();

    this.options = {
      tagName: "ul",
      className: "",
      suppressible: true,
      fixedSize: false,
      itemHeight: 24,
      createHandler: () => document.createElement(tagName),
      renderHandler: () => {},
      ...options,
    };
    const { tagName, className } = this.options;
    this.root = root;
    this.scrollbar = new Scrollbar(this.root);
    this.container = document.createElement(tagName);
    this.container.className = `unitext-listview ${className}`;
    this.container.tabIndex = 0;

    this.runway = document.createElement("div");
    this.runway.className = "listview-runway";
    this.container.appendChild(this.runway);
    this.root.appendChild(this.container);
  }

  /**
   * @description 启动函数
   */
  public invoke(): void {
    this.scrollbar.invoke();
    this.container.addEventListener("scroll", this.onScroll.bind(this));
    this.container.addEventListener("click", this.onClick.bind(this));
    if (!this.options.fixedSize) {
      window.addEventListener("resize", this.onResize.bind(this));
    }

    this._measureSize();
  }

  /**
   * @description 清理函数
   */
  public dispose(): void {
    this.clear();
    window.removeEventListener("resize", this.onResize);
    this.container.removeEventListener("scroll", this.onScroll);
    this.container.removeEventListener("click", this.onClick);
    this.scrollbar.dispose();
    this.root.appendChild(this.container);
  }

  /**
   * @description 更新配置
   * @param options 新的配置项
   */
  public updateOptions(options: IListViewOptions<T>): void {
    this.options = options;

    // TODO 处理新配置的更新
    this.scrollbar.updateOptions({ suppressible: options.suppressible });
  }

  /**
   * @description 增量添加数据
   *
   * - 适合懒加载
   * - 数据插入后将计算影响范围，影响视口内则将触发渲染
   *
   * @param dataList 待插入的数据域
   * @param index 可选，插入的位置
   */
  public insertData(dataList: Array<T>, index?: number): void {
    /* 处理越界行为 */
    const maxIndex = this.sourceList.length;
    const position = index === undefined || index < 0 || index > maxIndex ? maxIndex : index;

    /* 添加数据 */
    this.sourceList.splice(position, 0, ...dataList);

    /* 处理视口内的更新 */
    if (position) {
    }

    this._stretchList();
    this._renderList();
  }

  // TODO
  public deleteData(index: number, count: number = 1): Array<T> {
    const deleted = this.sourceList.splice(index, count);

    this._stretchList();
    this._recycleList();
    this._renderList();
    return deleted;
  }

  /**
   * @description 全量更新数据，但只渲染视口内数据
   * @param dataList 新数据域
   */
  public updateData(dataList: Array<T>): void {
    /* 更新数据 */
    this.sourceList = [];
    this.sourceList.push(...dataList);

    /* 动态计算各尺寸 */
    if (!this.options.fixedSize) {
      this._measureSize();
    }

    /* 更新 DOM */
    const children = this.container.children;
    for (let index = children.length - 1; index > RUNWAY_COUNT; index--) {
      this.container.removeChild(children[index]);
    }

    const nodes = [];
    const { virtualItemCount } = this;
    for (let index = 0; index < virtualItemCount; index++) {
      nodes.push(this.options.createHandler());
    }
    this.container.append(...nodes);

    if (this.sourceList.length <= virtualItemCount) {
      this.container.scrollTo({ top: 0 });
    }

    this._stretchList();
    this._renderList();
  }

  /**
   * @description 渲染某一项
   * @param data 待渲染数据
   * @param index 待渲染数据的索引
   */
  public renderItem(data: T, index: number): void {
    const { itemHeight } = this.options;
    const scrolledTop = this.container.scrollTop;
    const startIndex = Math.floor(scrolledTop / itemHeight);
    const nodeIndex = index - startIndex;
    const node = this.container.children[nodeIndex + RUNWAY_COUNT] as HTMLElement;
    this.options.renderHandler(node, data, nodeIndex + RUNWAY_COUNT);
  }

  /**
   * @description 手动更新容器尺寸。对外暴露的方法
   */
  public doResize(): void {
    this.onResize();
  }

  /**
   * @description 测量尺寸
   */
  private _measureSize(): void {
    this.cachedValue.runwayHeight = this.runway.clientHeight;
    this.cachedValue.runwayWidth = this.runway.clientWidth;
  }

  /***
   * @description 撑开容器
   */
  private _stretchList(): void {
    const x = 0; // TODO
    const y = this.actualContainerHeight - this.runway.clientHeight;
    this.runway.style.transform = `translate(${x}px, ${y}px)`;
  }

  /**
   * @description 渲染函数
   */
  private _renderList(): void {
    const { virtualItemCount } = this;
    const { itemHeight } = this.options;
    const scrolledTop = this.container.scrollTop;

    /* 偏移列表 */
    const offset = scrolledTop % itemHeight;
    const startIndex = Math.floor(scrolledTop / itemHeight);
    const endIndex = startIndex + virtualItemCount;

    /* 渲染视口数据 */
    const actualList = this.container.children;
    const virtualList = this.sourceList.slice(startIndex, endIndex);

    for (let index = 0; index < virtualItemCount; index++) {
      const node = actualList[index + RUNWAY_COUNT] as HTMLElement;
      const x = 0;
      const y = scrolledTop + index * itemHeight - offset;
      node.style.transform = `translate(${x}px, ${y}px)`;

      const data = virtualList[index];

      /* data 为空则是补足的元素 */
      if (!!data) {
        const actualIndex = index + startIndex;
        node.dataset.index = actualIndex.toString();
        this.options.renderHandler(node, data, actualIndex);
      }
    }
  }

  private _recycleList(): void {}

  /**
   * @description 滚动后的回调函数
   */
  private onScroll(event: Event): void {
    const { scrollTop } = event.target as HTMLElement;
    const { virtualContainerHeight } = this.cachedValue;

    /* 越界操作 */
    if (scrollTop < 0 || scrollTop + virtualContainerHeight > this.actualContainerHeight) {
      return;
    }

    this._renderList();
  }

  private onClick(event: Event): void {
    this.emit("click", event);
  }

  /**
   * @description 缩放后的回调函数
   */
  private onResize(): void {
    const cachedHeight = this.cachedValue.virtualContainerHeight;
    const actualHeight = this.container.clientHeight;

    if (cachedHeight < actualHeight) {
      /* 放大 */
      const count =
        Math.ceil(actualHeight / this.options.itemHeight) +
        DSURPLUS_COUNT -
        (this.container.children.length - RUNWAY_COUNT);

      const nodes = [];
      for (let index = 0; index < count; index++) {
        nodes.push(this.options.createHandler());
      }
      this.container.append(...nodes);
    }

    if (cachedHeight > actualHeight) {
      /* 缩小 */
      // TODO 启动定时器清理节点
      this._recycleList();
    }

    this._renderList();
  }
}
