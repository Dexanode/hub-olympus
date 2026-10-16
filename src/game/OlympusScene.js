import Phaser from 'phaser';
import olympusMap from '../assets/olympus-map.svg';

export default class OlympusScene extends Phaser.Scene {
  constructor() {
    super('Olympus');
  }

  preload() {
    this.load.image('olympus-map', olympusMap);
  }

  create() {
    this.add.image(800, 450, 'olympus-map').setDisplaySize(1600, 900);
    this.cameras.main.setBounds(0, 0, 1600, 900);
    this.cameras.main.centerOn(800, 450);
  }
}
