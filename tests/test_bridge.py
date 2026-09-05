import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "native-host" / "bridge.py"
SPEC = importlib.util.spec_from_file_location("bridge", MODULE_PATH)
bridge = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(bridge)


class BridgeValidationTests(unittest.TestCase):
    def test_accepts_process_query(self):
        args = bridge.validate_args(["ps", "aux"])
        bridge.validate_command(args)

    def test_blocks_shell(self):
        with self.assertRaisesRegex(ValueError, "Ejecutable no permitido"):
            bridge.validate_command(["bash", "-c", "id"])

    def test_blocks_executable_path_spoofing(self):
        with self.assertRaisesRegex(ValueError, "mediante una ruta"):
            bridge.validate_command(["/tmp/ps", "aux"])

    def test_blocks_systemctl_restart(self):
        with self.assertRaisesRegex(ValueError, "systemctl"):
            bridge.validate_command(["systemctl", "restart", "sshd"])

    def test_accepts_systemctl_status(self):
        bridge.validate_command(["systemctl", "status", "sshd"])

    def test_blocks_ip_mutation(self):
        with self.assertRaisesRegex(ValueError, "consultas"):
            bridge.validate_command(["ip", "link", "set", "eth0", "down"])

    def test_accepts_ip_query(self):
        bridge.validate_command(["ip", "address", "show"])

    def test_blocks_loginctl_terminate(self):
        with self.assertRaisesRegex(ValueError, "loginctl"):
            bridge.validate_command(["loginctl", "terminate-user", "zoa"])

    def test_blocks_hostname_change(self):
        with self.assertRaisesRegex(ValueError, "hostnamectl"):
            bridge.validate_command(["hostnamectl", "set-hostname", "oops"])

    def test_blocks_time_change(self):
        with self.assertRaisesRegex(ValueError, "timedatectl"):
            bridge.validate_command(["timedatectl", "set-time", "12:00:00"])

    def test_rejects_shell_metacharacters(self):
        with self.assertRaisesRegex(ValueError, "Argumento no permitido"):
            bridge.validate_args(["ps", ";", "rm"])

    def test_rejects_unknown_tool(self):
        with self.assertRaisesRegex(ValueError, "Herramienta"):
            bridge.execute({"version": 1, "tool": "anything"})

    def test_update_rejects_non_git_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            fake_host = Path(temporary) / "native-host" / "bridge.py"
            fake_host.parent.mkdir()
            fake_host.write_text("", encoding="utf-8")
            (Path(temporary) / "config.json").write_text(
                json.dumps({"source_dir": temporary}), encoding="utf-8"
            )
            with patch.object(bridge, "__file__", str(fake_host)):
                with self.assertRaisesRegex(ValueError, "clon Git"):
                    bridge.update_bridge()

    def test_rejects_unknown_application(self):
        with self.assertRaisesRegex(ValueError, "Aplicación"):
            bridge.open_application({"app": "anything"})

    def test_rejects_path_outside_home(self):
        with self.assertRaisesRegex(ValueError, "carpeta personal"):
            bridge.open_path({"path": "/etc"})


if __name__ == "__main__":
    unittest.main()
