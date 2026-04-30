class ThirdPartyError(RuntimeError):
    pass


class ThirdPartyAuthError(ThirdPartyError):
    pass


class ThirdPartyUpstreamError(ThirdPartyError):
    pass

