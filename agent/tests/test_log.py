import json

from lendloop_agent.log import configure_logging, get_logger


def test_logs_are_json_and_secrets_are_redacted(capsys) -> None:
    configure_logging("INFO", "test-service")
    get_logger().info("calling_model", api_key="sk-live-123", authorization="Bearer abc", model="x")
    line = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert line["message"] == "calling_model"
    assert line["service"] == "test-service"
    assert line["api_key"] == "[redacted]"
    assert line["authorization"] == "[redacted]"
    assert line["model"] == "x"
