"""Tests du relais local ; le faux robot ne commande aucun matériel."""
import gzip
import json
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
import bridge


class BridgeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.calls = []
        cls.response = (200, 'text/plain', b'OK', True)

        def fake_robot(route, query):
            cls.calls.append((route, query))
            return cls.response

        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), bridge.make_handler(bridge.load_assets(), 'test-key', fake_robot))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def get(self, path, headers=None):
        try:
            result = urlopen(Request(self.base + path, headers=headers or {}), timeout=2)
        except HTTPError as error:
            result = error
        with result:
            return result.status, result.headers, result.read()

    def test_assets_and_no_command_at_startup(self):
        before = len(self.calls)
        status, headers, data = self.get('/')
        self.assertEqual(status, 200)
        self.assertIn(b'Mission Lidar', gzip.decompress(data))
        status, headers, data = self.get('/mission.js')
        self.assertIn(b"MISSION_KEY='test-key'", gzip.decompress(data))
        self.assertNotIn(b'__MISSION_KEY__', gzip.decompress(data))
        for path in ['/worker.js', '/session.js', '/acquisition.js', '/visualisation/core.js', '/visualisation/grid.js', '/visualisation/grid-localisation.js']:
            self.assertEqual(self.get(path)[0], 200, path)
        raw = json.loads(gzip.decompress(self.get('/data/acquisitions.json')[2]))
        saved = json.loads(gzip.decompress(self.get('/data/session.json')[2]))
        self.assertEqual(len(raw['scans']), 300)
        self.assertEqual(len(saved['accepted']), 70)
        self.assertEqual(len(self.calls), before)

    def test_command_requires_local_key_and_valid_route(self):
        before = len(self.calls)
        self.assertEqual(self.get('/robot/forward?seq=10')[0], 403)
        self.assertEqual(self.get('/robot/forward?seq=bad', {'X-Mission-Key':'test-key'})[0], 400)
        self.assertEqual(self.get('/robot/forward?seq=0', {'X-Mission-Key':'test-key'})[0], 400)
        self.assertEqual(self.get('/robot/unknown', {'X-Mission-Key':'test-key'})[0], 404)
        self.assertEqual(self.get('/robot/forward?seq=10&url=https://example.com', {'X-Mission-Key':'test-key'})[0], 400)
        self.assertEqual(len(self.calls), before)

    def test_proxy_preserves_http_status_and_stop_sequence(self):
        type(self).response = (409, 'text/plain', b'OLD_COMMAND', True)
        status, headers, data = self.get('/robot/stop?seq=123', {'X-Mission-Key':'test-key'})
        self.assertEqual((status, data, headers['X-Robot-Reachable']), (409, b'OLD_COMMAND', '1'))
        self.assertEqual(self.calls[-1], ('/stop', 'seq=123'))

    def test_robot_unreachable_is_explicit(self):
        type(self).response = (504, 'text/plain', b'Robot injoignable depuis ce PC', False)
        status, headers, data = self.get('/robot/ping', {'X-Mission-Key':'test-key'})
        self.assertEqual(status, 504)
        self.assertEqual(headers['X-Robot-Reachable'], '0')
        self.assertIn(b'injoignable', data)

    def test_cross_origin_and_host_rejected(self):
        before = len(self.calls)
        self.assertEqual(self.get('/robot/stop?seq=2', {'X-Mission-Key':'test-key','Origin':'https://example.com'})[0], 403)
        self.assertEqual(self.get('/', {'Host':'example.com'})[0], 403)
        self.assertEqual(len(self.calls), before)


if __name__ == '__main__':
    unittest.main()
