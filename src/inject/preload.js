'use strict';

const { ipcRenderer, webFrame } = require('electron');
const MenuHandler = require('../handlers/menu');
const ShareMenu = require('./share_menu');
const MentionMenu = require('./mention_menu');
const BadgeCount = require('./badge_count');
const Common = require('../common');
require("./hide-download-entry")
require("./message-menu")
// const EmojiParser = require('./emoji_parser');
// const emojione = require('emojione');

const AppConfig = require('../configuration');
const { patch } = require('./utils');

class Injector {
  init() {
    if (Common.DEBUG_MODE) {
      Injector.lock(window, 'console', window.console);
    }
    this.initInjectBundle();
    this.initAngularInjection();
    this.lastUser = null;
    this.initIPC();
    // webFrame.setZoomLevelLimits(1, 1);

    new MenuHandler().create();
  }

  initAngularInjection() {
    const self = this;
    const angular = window.angular = {};
    let module = angular.module
    Object.defineProperty(angular, 'module', {
      get: () => {
        if (module) {
          return (name, ...args) => {
            const m = module(name, ...args)
            if (name === 'Services') {
              const ext = require('../../ext/dist/lib.umd.js')
              ext.init()
              ext.initHookServices(m)
            } else if (name === 'Controllers') {
              const ext = require('../../ext/dist/lib.umd.js')
              ext.initHookControllers(m)
              ext.init()
            }
            return m
          }
        }
        return module
      },
      set: (m) => {
        module = m
      }
    })
    let angularBootstrapReal;
    Object.defineProperty(angular, 'bootstrap', {
      get: () => angularBootstrapReal ? function(element, moduleNames) {
        const moduleName = 'webwxApp';
        if (moduleNames.indexOf(moduleName) < 0) return;

        let constants = null;
        angular.injector(['ng', 'Services']).invoke(['confFactory', (confFactory) => {
          constants = confFactory
        }]);
        angular.module(moduleName).config(['$httpProvider', ($httpProvider) => {
          $httpProvider.defaults.transformResponse.push((value) => {
            return self.transformResponse(value, constants);
          });
        },
        ]).run(['$rootScope', '$templateCache', ($rootScope, $templateCache) => {
          ipcRenderer.send('wx-rendered', MMCgi.isLogin);
          console.log($rootScope, $templateCache)

          $rootScope.$on('newLoginPage', () => {
            ipcRenderer.send('user-logged', '');
          });
          $rootScope.shareMenu = ShareMenu.inject;
          const ext = require('../../ext/dist/lib.umd.js')
          ext.initTemplateHook($templateCache)
          ext.init()
        }]);
        return angularBootstrapReal.apply(angular, arguments);
      } : angularBootstrapReal,
      set: (real) => (angularBootstrapReal = real),
    });
  }

  initInjectBundle() {
    const initModules = () => {
      if (!window.$) {
        return setTimeout(initModules, 3000);
      }

      MentionMenu.init();
      BadgeCount.init();
    };

    window.onload = () => {
      initModules();
      window.addEventListener('online', () => {
        ipcRenderer.send('reload', true);
      });
    };
  }

  transformResponse(value, constants) {
    if (!value) return value;

    switch (typeof value) {
      case 'object':
        /* Inject emoji stickers and prevent recalling. */
        return this.checkEmojiContent(value, constants);
      case 'string':
        /* Inject share sites to menu. */
        return this.checkTemplateContent(value);
    }
    return value;
  }

  static lock(object, key, value) {
    return Object.defineProperty(object, key, {
      get: () => value,
      set: () => { },
    });
  }

  checkEmojiContent(value, constants) {
    if (!(value.AddMsgList instanceof Array)) return value;
    value.AddMsgList.forEach((msg) => {
      switch (msg.MsgType) {
        // case constants.MSGTYPE_TEXT:
        //   msg.Content = EmojiParser.emojiToImage(msg.Content);
        //   break;
        case constants.MSGTYPE_EMOTICON:
          console.log('Emotion Msg', msg)
          Injector.lock(msg, 'MMDigest', '[Emoticon]');
          Injector.lock(msg, 'MsgType', constants.MSGTYPE_EMOTICON);
          if (msg.ImgHeight >= Common.EMOJI_MAXIUM_SIZE) {
            Injector.lock(msg, 'MMImgStyle', { height: `${Common.EMOJI_MAXIUM_SIZE}px`, width: 'initial' });
          } else if (msg.ImgWidth >= Common.EMOJI_MAXIUM_SIZE) {
            Injector.lock(msg, 'MMImgStyle', { width: `${Common.EMOJI_MAXIUM_SIZE}px`, height: 'initial' });
          }
          break;
        case constants.MSGTYPE_RECALLED:
          if (AppConfig.readSettings('prevent-recall') === 'on') {
            Injector.lock(msg, 'MsgType', constants.MSGTYPE_SYS);
            Injector.lock(msg, 'MMActualContent', Common.MESSAGE_PREVENT_RECALL);
            Injector.lock(msg, 'MMDigest', Common.MESSAGE_PREVENT_RECALL);
          }
          break;
      }
    });
    return value;
  }

  checkTemplateContent(value) {
    const optionMenuReg = /optionMenu\(\);/;
    const messageBoxKeydownReg = /editAreaKeydown\(\$event\)/;
    if (optionMenuReg.test(value)) {
      value = value.replace(optionMenuReg, 'optionMenu();shareMenu();');
    } else if (messageBoxKeydownReg.test(value)) {
      value = value.replace(messageBoxKeydownReg, 'editAreaKeydown($event);mentionMenu($event);');
    }
    return value;
  }

  initIPC() {
    // clear currentUser to receive reddot of new messages from the current chat user
    ipcRenderer.on('hide-wechat-window', () => {
      this.lastUser = angular.element('#chatArea').scope().currentUser;
      angular.element('.chat_list').scope().itemClick("");
    });
    // recover to the last chat user
    ipcRenderer.on('show-wechat-window', () => {
      if (this.lastUser != null) {
        angular.element('.chat_list').scope().itemClick(this.lastUser);
      }
    });
  }
}

new Injector().init();
