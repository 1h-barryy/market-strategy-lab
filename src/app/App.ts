import { createInitialState, requestTest } from './state';
import { UI } from '../ui/UI';
import { World } from '../world/World';

export class App {
  private state = createInitialState();
  private readonly ui: UI;
  private world?: World;

  constructor(private readonly root: HTMLElement) {
    this.ui = new UI(root, this.state, (settings) => {
      this.state = requestTest(this.state, settings);
      this.ui.render(this.state);
    });
    try {
      this.world = new World(this.ui.viewport, () => this.ui.showWorldError());
    } catch (error) {
      console.warn('Unable to initialize the 3D viewport.', error);
      this.ui.showWorldError();
    }
  }

  dispose(): void {
    this.world?.dispose();
    this.root.replaceChildren();
  }
}
