import Phaser from 'phaser';
import olympusMap from '../assets/olympus-web3-map.jpg';

export default class OlympusScene extends Phaser.Scene {
  constructor() {
    super('Olympus');
  }

  preload() {
    this.load.image('olympus-map', olympusMap);
  }

  create() {
    this.add.image(1000, 558, 'olympus-map').setDisplaySize(2000, 1116);
    this.cameras.main.setBounds(0, 0, 2000, 1116);
    this.cameras.main.centerOn(1000, 558);
  }
}
