/* Ten configurable weighted-score grades. */
window.CHRONOS_ONLINE_BADGE_GRADES = Object.freeze([
  {
    "level": 1,
    "name": "GRADE 1",
    "nameColor": "#d9e2e8",
    "backgroundColor": "#27343d",
    "borderColor": "#60717b",
    "layout": "plain",
    "minPoints": 0
  },
  {
    "level": 2,
    "name": "GRADE 2",
    "nameColor": "#a9d7ff",
    "backgroundColor": "#20384b",
    "borderColor": "#5da6d9",
    "layout": "plain",
    "minPoints": 2
  },
  {
    "level": 3,
    "name": "GRADE 3",
    "nameColor": "#9be0c2",
    "backgroundColor": "#203f38",
    "borderColor": "#57b88d",
    "layout": "banner",
    "minPoints": 5
  },
  {
    "level": 4,
    "name": "GRADE 4",
    "nameColor": "#d7b2ff",
    "backgroundColor": "#34284a",
    "borderColor": "#a77ad6",
    "layout": "banner",
    "minPoints": 10
  },
  {
    "level": 5,
    "name": "GRADE 5",
    "nameColor": "#f1cf79",
    "backgroundColor": "#49391f",
    "borderColor": "#d6aa4f",
    "layout": "orbit",
    "minPoints": 18
  },
  {
    "level": 6,
    "name": "GRADE 6",
    "nameColor": "#ffb27a",
    "backgroundColor": "#4a2c20",
    "borderColor": "#d9854d",
    "layout": "orbit",
    "minPoints": 28
  },
  {
    "level": 7,
    "name": "GRADE 7",
    "nameColor": "#ff8d9c",
    "backgroundColor": "#4a202b",
    "borderColor": "#d85b75",
    "layout": "crown",
    "minPoints": 42
  },
  {
    "level": 8,
    "name": "GRADE 8",
    "nameColor": "#9fe9ec",
    "backgroundColor": "#1d4145",
    "borderColor": "#56b7bd",
    "layout": "crown",
    "minPoints": 60
  },
  {
    "level": 9,
    "name": "GRADE 9",
    "nameColor": "#f5e3a1",
    "backgroundColor": "#4b4020",
    "borderColor": "#e0c35e",
    "layout": "crown",
    "minPoints": 85
  },
  {
    "level": 10,
    "name": "GRADE 10",
    "nameColor": "#ffffff",
    "backgroundColor": "#563b19",
    "borderColor": "#f0cf73",
    "layout": "crown",
    "minPoints": 120
  }
].map(grade => Object.freeze(grade)));
