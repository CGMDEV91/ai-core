package eu.demo;

@Service
public class OrderService {
  public Order find(String id) {
    return load(id);
  }

  private Order load(String id) {
    return null;
  }

  @KafkaListener(topics = "orders-created")
  public void onCreated(String payload) {
    find(payload);
  }

  @Scheduled(cron = "0 0 * * * *")
  public void purge() {
  }
}
