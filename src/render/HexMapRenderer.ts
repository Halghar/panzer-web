/**
 * PixiJS-based hex grid renderer.
 *
 * Uses honeycomb-grid for the math (axial coords, neighbors, distances)
 * and PixiJS to draw hexagons + unit sprites on a canvas.
 */

import { Application, Container, Graphics, Text, FederatedPointerEvent } from 'pixi.js';
import { defineHex, Grid, Orientation, rectangle } from 'honeycomb-grid';
import { useGameStore, MAP_WIDTH, MAP_HEIGHT } from '@engine/state/store';
import { hexKey } from '@engine/state/types';
import type { Unit } from '@engine/state/types';
import { TERRAIN_DATA } from '@engine/terrain/types';
import { computeReachableHexes } from '@engine/movement/reachable';

const HEX_SIZE = 36;
const GRID_WIDTH = MAP_WIDTH;
const GRID_HEIGHT = MAP_HEIGHT;

function elevateColor(base: number, elevation: number): number {
  if (elevation === 0) return base;
  const f = 1 + elevation * 0.18;
  const r = Math.min(255, Math.round(((base >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((base >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((base & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}

const Hex = defineHex({
  dimensions: HEX_SIZE,
  orientation: Orientation.FLAT,
  origin: 'topLeft',
});
type HexInstance = InstanceType<typeof Hex>;

function formatTerrain(t: string): string {
  return t.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

export class HexMapRenderer {
  private app: Application;
  private mapContainer: Container;
  private hexLayer: Container;
  private unitLayer: Container;
  private overlayLayer: Container;
  private tooltip!: Container;
  private tooltipBg!: Graphics;
  private tooltipLines: Text[] = [];
  private grid: Grid<HexInstance>;
  private unsubscribe: (() => void) | null = null;
  private unitSprites: Map<string, Container> = new Map();
  private unitLabels: Map<string, Text> = new Map();
  private _initialized = false;
  private _pendingDestroy = false;
  private _movementReachable: Set<string> = new Set();
  private _spottingTargets: Set<string> = new Set();
  private _fireTargets: Set<string> = new Set();

  private readonly _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'r' || e.key === 'R') {
      this.mapContainer.rotation += Math.PI / 2;
      for (const label of this.unitLabels.values())
        label.rotation = -this.mapContainer.rotation;
    }
  };

  constructor() {
    this.app = new Application();
    this.mapContainer = new Container();
    this.hexLayer = new Container();
    this.unitLayer = new Container();
    this.overlayLayer = new Container();
    this.grid = new Grid(Hex, rectangle({ width: GRID_WIDTH, height: GRID_HEIGHT }));
  }

  async init(container: HTMLElement): Promise<void> {
    await this.app.init({
      width: container.clientWidth,
      height: container.clientHeight,
      background: '#2d3a2d',
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    if (this._pendingDestroy) {
      this.app.destroy(true, { children: true });
      return;
    }

    this._initialized = true;
    container.appendChild(this.app.canvas);
    this.app.stage.addChild(this.mapContainer);
    this.mapContainer.addChild(this.hexLayer);
    this.mapContainer.addChild(this.unitLayer);
    this.mapContainer.addChild(this.overlayLayer);

    this.drawHexes();
    this.centerGrid();
    this.createTooltip();
    this.setupPanZoom();
    this.subscribeToState();
    window.addEventListener('keydown', this._onKeyDown);

    this.renderUnits();
    this.drawDeploymentOverlay();
  }

  private drawHexes(): void {
    const { hexMap } = useGameStore.getState();

    for (const hex of this.grid) {
      const data = hexMap[hexKey(hex.q, hex.r)];
      const props = TERRAIN_DATA[data?.terrain ?? 'clear'];
      const fillColor = elevateColor(props.color, data?.elevation ?? 0);

      const g = new Graphics();
      g.poly(hex.corners.map((c) => ({ x: c.x, y: c.y })));
      g.fill({ color: fillColor });
      g.stroke({ color: 0x00000033, width: 1 });

      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointerover', (e) => { g.tint = 0xddeebb; this.showTooltip(hex); this.moveTooltip(e.global.x, e.global.y); });
      g.on('pointermove', (e) => { this.moveTooltip(e.global.x, e.global.y); });
      g.on('pointerout',  ()  => { g.tint = 0xffffff; this.hideTooltip(); });
      g.on('pointertap',  ()  => { this.handleHexClick(hex); });

      this.hexLayer.addChild(g);
    }
  }

  private handleHexClick(hex: HexInstance): void {
    const state = useGameStore.getState();

    // SETUP mode: place pending unit
    if (state.scenarioPhase === 'SETUP' && state.pendingDeploymentUnit) {
      const { blueprintId, side } = state.pendingDeploymentUnit;
      const defaultFacing = side === 'allied' ? 0 : 3;
      const result = state.placeUnitInDeployment(blueprintId, side, hex.q, hex.r, defaultFacing);
      if (result.ok) state.setPendingDeploymentUnit(null);
      return;
    }

    // MOVEMENT phase: move selected unit if hex is reachable
    if (
      state.currentPhase === 'MOVEMENT' &&
      state.selectedUnitId &&
      this._movementReachable.has(hexKey(hex.q, hex.r))
    ) {
      const occupied = Object.values(state.units).some(
        (u) => u.q === hex.q && u.r === hex.r && u.instanceId !== state.selectedUnitId,
      );
      if (!occupied) {
        state.moveUnit(state.selectedUnitId, hex.q, hex.r);
        return;
      }
    }

    // COMBAT phase: set fire target if hex contains a highlighted enemy
    if (
      state.currentPhase === 'COMBAT' &&
      state.selectedUnitId &&
      this._fireTargets.has(hexKey(hex.q, hex.r))
    ) {
      const enemy = Object.values(state.units).find(
        (u) => u.q === hex.q && u.r === hex.r,
      );
      if (enemy) {
        state.setFireTarget(enemy.instanceId);
        return;
      }
    }

    // Normal mode: select unit at hex
    const unitAtHex = Object.values(state.units).find(
      (u) => u.q === hex.q && u.r === hex.r,
    );
    state.selectUnit(unitAtHex?.instanceId ?? null);
  }

  private renderUnits(): void {
    const state = useGameStore.getState();

    // Remove sprites for units no longer present
    for (const [id, sprite] of this.unitSprites) {
      if (!state.units[id]) {
        this.unitLayer.removeChild(sprite);
        this.unitSprites.delete(id);
        this.unitLabels.delete(id);
      }
    }

    // Add/update sprites for current units
    for (const unit of Object.values(state.units)) {
      let sprite = this.unitSprites.get(unit.instanceId);
      if (!sprite) {
        sprite = this.makeUnitSprite(unit);
        this.unitSprites.set(unit.instanceId, sprite);
        this.unitLayer.addChild(sprite);
      }
      this.updateUnitSprite(sprite, unit);
    }

    // Recompute phase-specific highlights
    this.updateHighlights(state);

    // Highlight selected unit + phase overlays
    this.drawSelectionOverlay();
  }

  private updateHighlights(state: ReturnType<typeof useGameStore.getState>): void {
    this._movementReachable = new Set();
    this._spottingTargets = new Set();
    this._fireTargets = new Set();

    const { selectedUnitId, units, blueprints, hexMap, currentPhase, spottingPairs } = state;
    if (!selectedUnitId) return;
    const unit = units[selectedUnitId];
    if (!unit) return;

    if (currentPhase === 'MOVEMENT' && (unit.command === 'MOVE' || unit.command === 'SHORT_HALT') && !unit.hasActed) {
      const bp = blueprints[unit.blueprintId];
      if (bp) {
        this._movementReachable = computeReachableHexes(unit, bp, hexMap);
        this._movementReachable.delete(hexKey(unit.q, unit.r));
      }
    }

    if (currentPhase === 'SPOTTING') {
      for (const p of spottingPairs) {
        if (p.spotter !== selectedUnitId) continue;
        const tUnit = units[p.target];
        if (tUnit) this._spottingTargets.add(hexKey(tUnit.q, tUnit.r));
      }
    }

    if (currentPhase === 'COMBAT' && (unit.command === 'FIRE' || unit.command === 'SHORT_HALT')) {
      // Highlight spotted enemies that this unit can target
      for (const p of spottingPairs) {
        if (p.spotter !== selectedUnitId) continue;
        const tUnit = units[p.target];
        if (tUnit && tUnit.side !== unit.side) {
          this._fireTargets.add(hexKey(tUnit.q, tUnit.r));
        }
      }
    }
  }

  private makeUnitSprite(unit: Unit): Container {
    const container = new Container();
    const blueprint = useGameStore.getState().blueprints[unit.blueprintId];

    const bodyContainer = new Container();
    const body = new Graphics();
    const color = unit.side === 'allied' ? 0x6a7a3a : 0x6a5a3a;
    body.rect(-14, -14, 28, 28);
    body.fill({ color });
    body.stroke({ color: 0x000000, width: 2 });
    bodyContainer.addChild(body);
    container.addChild(bodyContainer);

    const label = new Text({
      text: blueprint?.name.split(' ')[0] ?? '?',
      style: { fontSize: 9, fill: 0xffffff, fontWeight: 'bold' },
    });
    label.anchor.set(0.5);
    label.rotation = -this.mapContainer.rotation;
    container.addChild(label);
    this.unitLabels.set(unit.instanceId, label);

    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      useGameStore.getState().selectUnit(unit.instanceId);
    });

    return container;
  }

  private updateUnitSprite(sprite: Container, unit: Unit): void {
    const hex = this.grid.getHex({ q: unit.q, r: unit.r });
    if (!hex) return;
    sprite.x = hex.x;
    sprite.y = hex.y;
    (sprite.children[0] as Container).rotation = (unit.facing * Math.PI) / 3;
  }

  private drawSelectionOverlay(): void {
    this.overlayLayer.removeChildren();
    const { selectedUnitId, units } = useGameStore.getState();

    // Movement reachable hexes (green fill)
    for (const key of this._movementReachable) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      const hex = this.grid.getHex({ q, r });
      if (!hex) continue;
      const g = new Graphics();
      g.poly(hex.corners.map((c) => ({ x: c.x, y: c.y })));
      g.fill({ color: 0x44cc44, alpha: 0.35 });
      g.stroke({ color: 0x88ff88, width: 1.5 });
      this.overlayLayer.addChild(g);
    }

    // Spotting targets (orange fill)
    for (const key of this._spottingTargets) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      const hex = this.grid.getHex({ q, r });
      if (!hex) continue;
      const g = new Graphics();
      g.poly(hex.corners.map((c) => ({ x: c.x, y: c.y })));
      g.fill({ color: 0xff8800, alpha: 0.40 });
      g.stroke({ color: 0xffcc44, width: 1.5 });
      this.overlayLayer.addChild(g);
    }

    // Fire targets (red fill)
    const { fireTargetId, units: stateUnits } = useGameStore.getState();
    for (const key of this._fireTargets) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      const hex = this.grid.getHex({ q, r });
      if (!hex) continue;
      // Check if this hex holds the currently selected fire target
      const isSelected = fireTargetId !== null &&
        Object.values(stateUnits).some(
          (u) => u.instanceId === fireTargetId && u.q === q && u.r === r,
        );
      const g = new Graphics();
      g.poly(hex.corners.map((c) => ({ x: c.x, y: c.y })));
      g.fill({ color: 0xff2222, alpha: isSelected ? 0.55 : 0.35 });
      g.stroke({ color: isSelected ? 0xff8888 : 0xff4444, width: isSelected ? 2.5 : 1.5 });
      this.overlayLayer.addChild(g);
    }

    if (!selectedUnitId) return;
    const unit = units[selectedUnitId];
    if (!unit) return;

    const hex = this.grid.getHex({ q: unit.q, r: unit.r });
    if (!hex) return;

    const ring = new Graphics();
    ring.poly(hex.corners.map((c) => ({ x: c.x, y: c.y })));
    ring.stroke({ color: 0xffd700, width: 3 });
    this.overlayLayer.addChild(ring);
  }

  private createTooltip(): void {
    this.tooltip = new Container();
    this.tooltip.visible = false;
    this.tooltip.zIndex = 1000;

    this.tooltipBg = new Graphics();
    this.tooltip.addChild(this.tooltipBg);

    for (let i = 0; i < 6; i++) {
      const t = new Text({ text: '', style: { fontSize: 11, fill: i === 0 ? 0xffd700 : 0xdddddd, fontWeight: i === 0 ? 'bold' : 'normal' } });
      t.x = 8;
      t.y = 6 + i * 15;
      this.tooltipLines.push(t);
      this.tooltip.addChild(t);
    }

    this.app.stage.addChild(this.tooltip);
  }

  private showTooltip(hex: HexInstance): void {
    const { hexMap } = useGameStore.getState();
    const data = hexMap[hexKey(hex.q, hex.r)] ?? { terrain: 'clear' as const, elevation: 0 };
    const props = TERRAIN_DATA[data.terrain];

    const lines = [
      formatTerrain(data.terrain),
      `Cover:    ${props.cover}`,
      `Move:     ${props.moveCost === 99 ? '∞' : props.moveCost}`,
      `Height:   ${props.height}`,
      `LOS:      ${props.blocksLOS ? 'blocked' : 'open'}`,
      `Elev:     ${data.elevation}`,
    ];
    lines.forEach((text, i) => { this.tooltipLines[i]!.text = text; });

    const W = 148;
    const H = 6 + lines.length * 15 + 6;
    this.tooltipBg.clear();
    this.tooltipBg.roundRect(0, 0, W, H, 5);
    this.tooltipBg.fill({ color: 0x111111, alpha: 0.88 });
    this.tooltipBg.stroke({ color: 0x444444, width: 1 });

    this.tooltip.visible = true;
  }

  private moveTooltip(mx: number, my: number): void {
    if (!this.tooltip.visible) return;
    const W = 148;
    const H = (this.tooltipBg as Graphics).height;
    const x = mx + 14 + W > this.app.screen.width  ? mx - W - 6 : mx + 14;
    const y = my + 14 + H > this.app.screen.height ? my - H - 6 : my + 14;
    this.tooltip.position.set(x, y);
  }

  private hideTooltip(): void {
    this.tooltip.visible = false;
  }

  private centerGrid(): void {
    const bounds = this.hexLayer.getBounds();
    this.mapContainer.pivot.set(
      bounds.x + bounds.width  / 2,
      bounds.y + bounds.height / 2,
    );
    this.mapContainer.position.set(
      this.app.screen.width  / 2,
      this.app.screen.height / 2,
    );
  }

  private setupPanZoom(): void {
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    this.app.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 2 && e.button !== 1) return; // right or middle button
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      this.mapContainer.x += e.clientX - lastX;
      this.mapContainer.y += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    this.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.app.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this.mapContainer.scale.x *= factor;
      this.mapContainer.scale.y *= factor;
    });
  }

  private subscribeToState(): void {
    this.unsubscribe = useGameStore.subscribe(() => {
      this.renderUnits();
      this.drawDeploymentOverlay();
    });
  }

  private drawDeploymentOverlay(): void {
    // Remove previous deployment overlays (keep selection ring if present)
    const toRemove = this.overlayLayer.children.filter((c) => (c as any).__deploymentOverlay);
    for (const c of toRemove) this.overlayLayer.removeChild(c);

    const state = useGameStore.getState();
    if (state.scenarioPhase !== 'SETUP') return;

    const scenario = state.currentScenario;
    if (!scenario) return;

    const pending = state.pendingDeploymentUnit;

    for (const zone of scenario.deploymentZones) {
      const color = zone.side === 'allied' ? 0x4488ff : 0xff6644;
      const alpha = pending?.side === zone.side ? 0.35 : 0.15;

      for (const { q, r } of zone.allowedHexes) {
        const hex = this.grid.getHex({ q, r });
        if (!hex) continue;

        const g = new Graphics();
        g.poly(hex.corners.map((c) => ({ x: c.x, y: c.y })));
        g.fill({ color, alpha });
        (g as any).__deploymentOverlay = true;
        this.overlayLayer.addChild(g);
      }
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    window.removeEventListener('keydown', this._onKeyDown);
    if (this._initialized) {
      this.app.destroy(true, { children: true });
    } else {
      this._pendingDestroy = true;
    }
  }
}
