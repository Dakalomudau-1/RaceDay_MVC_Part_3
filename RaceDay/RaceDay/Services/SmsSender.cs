namespace RaceDay.Services
{
    public interface ISmsSender
    {
        void Send(string phoneNumber, string message);
    }

    // Demo sender: prints the "SMS" in the API console. Swap for a Twilio/Clickatell sender in production.
    public class ConsoleSmsSender : ISmsSender
    {
        public void Send(string phoneNumber, string message)
        {
            Console.WriteLine($"[DEMO SMS] To {phoneNumber}: {message}");
        }
    }
}
