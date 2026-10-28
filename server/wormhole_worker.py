"""Isolated Twisted reactor for one encrypted, dilated magic-wormhole link."""
import argparse
import json
import sys
import threading
from twisted.internet import task, defer, protocol
from twisted.protocols.basic import NetstringReceiver
from wormhole import create
from wormhole.cli.public_relay import MAILBOX_RELAY, TRANSIT_RELAY

APPID = 'github.com/BDUG/singlepageapps/wormhole-v1'
MAX_FRAME = 12 * 1024 * 1024

def emit(value):
    print(json.dumps(value, separators=(',', ':')), flush=True)

class Channel(NetstringReceiver):
    MAX_LENGTH = MAX_FRAME
    def connectionMade(self):
        self.factory.channel = self
        self.sendString(json.dumps({'type':'hello','protocol':1,'role':self.factory.args.role,'kind':self.factory.args.kind}).encode())
    def stringReceived(self, data):
        try:
            value = json.loads(data)
            if not isinstance(value, dict): raise ValueError('Invalid peer message')
            emit({'event':'message','message':value})
        except (ValueError, UnicodeError, RecursionError):
            self.transport.loseConnection()
    def connectionLost(self, reason):
        if not self.factory.finished.called: self.factory.finished.callback(None)

@defer.inlineCallbacks
def main(reactor, args):
    w = create(APPID, args.relay, reactor, dilation=True)
    factory = protocol.Factory.forProtocol(Channel)
    factory.args=args;factory.channel=None;factory.finished=defer.Deferred()
    def command(value):
        if value.get('op') == 'close':
            if not factory.finished.called: factory.finished.callback(None)
        elif value.get('op') == 'send' and factory.channel:
            factory.channel.sendString(json.dumps(value['message'], separators=(',', ':')).encode())
    def stdin():
        try:
            while True:
                line=sys.stdin.buffer.readline(MAX_FRAME+1)
                if not line:break
                if len(line)>MAX_FRAME:raise ValueError('Message too large')
                reactor.callFromThread(command,json.loads(line))
        finally:reactor.callFromThread(command,{'op':'close'})
    try:
        if args.code:w.set_code(args.code)
        else:w.allocate_code(code_length=3)
        code=yield w.get_code();emit({'event':'code','code':code})
        dilation=w.dilate(transit_relay_location=args.transit,expected_subprotocols=['tlal-v1'])
        yield dilation.listener_for('tlal-v1').listen(factory)
        yield w.get_verifier()
        yield dilation.when_dilated()
        if not args.code:yield dilation.connector_for('tlal-v1').connect(factory)
        threading.Thread(target=stdin,daemon=True).start()
        yield factory.finished
    except Exception as error:
        emit({'event':'error','error':str(error)[:400] or type(error).__name__})
    finally:
        try:yield w.close()
        except Exception:pass
        emit({'event':'closed'})

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--code',default='')
    parser.add_argument('--role',choices=['master','participant'],required=True)
    parser.add_argument('--kind',choices=['files','colabrix'],required=True)
    parser.add_argument('--relay',default=MAILBOX_RELAY)
    parser.add_argument('--transit',default=TRANSIT_RELAY)
    task.react(main,[parser.parse_args()])
